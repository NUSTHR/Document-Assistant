import {
  extractCitedReferenceNumbers,
  findLatestReferencedMessage,
  findLatestTurnReferencedMessage,
  normalizeSourceItems,
  resolveReferenceNumbers,
  type CitationMessage,
  type SourceItem,
  toHistoricalSourceItems,
} from './citation-sources'
import { toAnswerSegments } from './workspace-presenters'
import type { RagflowSession, RagflowSessionMessage } from '../types/integration'

export interface CitationDisplayMessage extends CitationMessage {
  id: string
}

export interface SourceItemResolutionInput<TMessage extends CitationDisplayMessage> {
  activeCitationMessageId: string
  hasLiveReferenceState: boolean
  liveSourceItems: SourceItem[]
  messages: TMessage[]
  readLatestSnapshot: (sessionId: string) => SourceItem[]
  readSnapshot: (sessionId: string, messageId: string) => SourceItem[]
  sessionId: string
}

export function resolveActiveCitationMessageId(
  session: RagflowSession,
  candidateMessageId: string,
): string {
  const candidateIndex = parseTranscriptMessageIndex(session, candidateMessageId)
  if (
    candidateIndex !== null &&
    hasDisplayableSessionReferences(session.messages[candidateIndex])
  ) {
    return candidateMessageId
  }

  const latestReferenceCarrier = findLatestDisplayableSessionMessage(session)
  return latestReferenceCarrier
    ? toTranscriptMessageId(session.biz_session_id, latestReferenceCarrier.index)
    : ''
}

export function resolveDisplayedSourceItems<TMessage extends CitationDisplayMessage>(
  input: SourceItemResolutionInput<TMessage>,
): SourceItem[] {
  if (input.hasLiveReferenceState) {
    return input.liveSourceItems
  }

  if (input.activeCitationMessageId) {
    const selectedMessage = input.messages.find((message) => {
      return message.id === input.activeCitationMessageId
    })
    if (selectedMessage) {
      const selectedSnapshot = normalizeSourceItems(
        input.readSnapshot(input.sessionId, input.activeCitationMessageId),
      )
      if (selectedSnapshot.length > 0) {
        return selectedSnapshot
      }

      if (!selectedMessage.references.length) {
        return []
      }

      return toHistoricalSourceItems(
        selectedMessage.references,
        selectedMessage.referenceNumbers,
        selectedMessage.citedReferenceNumbers,
      )
    }

    const selectedSnapshot = input.readSnapshot(
      input.sessionId,
      input.activeCitationMessageId,
    )
    if (selectedSnapshot.length > 0) {
      return normalizeSourceItems(selectedSnapshot)
    }
  }

  const historicalMessage =
    findLatestTurnReferencedMessage(input.messages) ??
    findLatestReferencedMessage(input.messages)
  if (historicalMessage) {
    return toHistoricalSourceItems(
      historicalMessage.references,
      historicalMessage.referenceNumbers,
      historicalMessage.citedReferenceNumbers,
    )
  }

  return normalizeSourceItems(input.readLatestSnapshot(input.sessionId))
}

export function parseTranscriptMessageIndex(
  session: RagflowSession,
  messageId: string,
): number | null {
  const prefix = `${session.biz_session_id}-`
  if (!messageId.startsWith(prefix)) {
    return null
  }

  const rawIndex = messageId.slice(prefix.length)
  const index = Number(rawIndex)
  if (!Number.isInteger(index) || index < 0 || index >= session.messages.length) {
    return null
  }

  return index
}

export function findLatestDisplayableSessionMessage(
  session: RagflowSession,
): { index: number } | null {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index]
    if (hasDisplayableSessionReferences(message)) {
      return { index }
    }
  }

  return null
}

export function hasDisplayableSessionReferences(
  message: RagflowSessionMessage | undefined,
): boolean {
  if (!message || message.role !== 'assistant' || message.references.length === 0) {
    return false
  }

  const answer = stripThinkBlock(message.content)
  const answerSegments = toAnswerSegments(answer)
  const citedReferenceNumbers = extractCitedReferenceNumbers(answerSegments)
  if (citedReferenceNumbers.length === 0) {
    return false
  }

  return toHistoricalSourceItems(
    message.references,
    resolveReferenceNumbers(answerSegments, message.references.length),
    citedReferenceNumbers,
  ).length > 0
}

export function toTranscriptMessageId(nextSessionId: string, messageIndex: number): string {
  return `${nextSessionId || 'session'}-${messageIndex}`
}

function stripThinkBlock(content: string): string {
  const closedMatch = content.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i)
  if (closedMatch) {
    return (closedMatch[2] ?? '').trim()
  }

  const openMatch = content.match(/<think>([\s\S]*)/i)
  if (openMatch) {
    return ''
  }

  if (!content.toLowerCase().includes('</think>')) {
    return content
  }

  return content.replace(/<\/?think>/gi, '').trim()
}
