import type { ChatReference } from '../types/integration'
import type { AnswerSegment, ReferenceCard } from '../types/workspace'

const DEFAULT_PREVIEW_LIMIT = 400

export interface SourceItem {
  id: string
  label: string
  score: string
  title: string
  content: string
  fullContent: string
  sourceName: string
  referenceNumber: number
  isLiveReference: boolean
}

export interface CitationMessage {
  role: 'user' | 'assistant'
  references: ChatReference[]
  referenceNumbers: number[]
  citedReferenceNumbers?: number[]
}

export function findLatestReferencedMessage<TMessage extends CitationMessage>(
  messages: TMessage[],
): TMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message && hasDisplayableReferences(message)) {
      return message
    }
  }

  return null
}

export function findLatestTurnReferencedMessage<TMessage extends CitationMessage>(
  messages: TMessage[],
): TMessage | null {
  const latestAssistantIndex = findLatestAssistantIndex(messages)
  const turnEndIndex = latestAssistantIndex >= 0 ? latestAssistantIndex : messages.length - 1
  const previousAssistantIndex =
    latestAssistantIndex >= 0
      ? findLatestAssistantIndex(messages.slice(0, latestAssistantIndex))
      : -1

  for (let index = turnEndIndex; index > previousAssistantIndex; index -= 1) {
    const message = messages[index]
    if (message && hasDisplayableReferences(message)) {
      return message
    }
  }

  return null
}

function findLatestAssistantIndex<TMessage extends CitationMessage>(
  messages: TMessage[],
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return index
    }
  }

  return -1
}

export function toLiveSourceItems(
  references: ReferenceCard[],
  referenceNumbers: number[],
  citedReferenceNumbers: number[] = [],
): SourceItem[] {
  return filterSourceItemsByCitedNumbers(
    normalizeSourceItems(references.map((reference, index) => {
      const referenceNumber = reference.referenceNumber ?? referenceNumbers[index] ?? index
      return {
        id: reference.key,
        label: `REF [${referenceNumber}]`,
        score: `${Math.round(reference.similarityScore * 100)}% Match`,
        title: reference.bizFileName,
        content: truncatePreviewText(reference.chunkContent),
        fullContent: reference.chunkContent,
        sourceName: reference.bizFileName,
        referenceNumber,
        isLiveReference: true,
      }
    })),
    citedReferenceNumbers,
  )
}

export function toHistoricalSourceItems(
  references: ChatReference[],
  referenceNumbers: number[],
  citedReferenceNumbers: number[] = [],
): SourceItem[] {
  return filterSourceItemsByCitedNumbers(
    normalizeSourceItems(references.map((reference, index) => {
      const referenceNumber = reference.reference_number ?? referenceNumbers[index] ?? index
      return {
        id: `${reference.biz_file_id}-${index}-${reference.chunk_content}`,
        label: `REF [${referenceNumber}]`,
        score: `${Math.round(reference.similarity_score * 100)}% Match`,
        title: reference.biz_file_name,
        content: truncatePreviewText(reference.chunk_content),
        fullContent: reference.chunk_content,
        sourceName: reference.biz_file_name,
        referenceNumber,
        isLiveReference: false,
      }
    })),
    citedReferenceNumbers,
  )
}

export function extractCitedReferenceNumbers(segments: AnswerSegment[]): number[] {
  const citedNumbers = new Set<number>()
  for (const segment of segments) {
    if (segment.kind === 'reference' && segment.referenceNumber !== null) {
      citedNumbers.add(segment.referenceNumber)
    }
  }

  return [...citedNumbers]
}

export function resolveReferenceNumbers(
  segments: AnswerSegment[],
  referenceCount: number,
): number[] {
  const numbers = segments.flatMap((segment) => {
    return segment.kind === 'reference' && segment.referenceNumber !== null
      ? [segment.referenceNumber]
      : []
  })
  if (numbers.length > 0) {
    return numbers.slice(0, referenceCount)
  }

  return Array.from({ length: referenceCount }, (_value, index) => index)
}

export function truncatePreviewText(
  value: string,
  limit = DEFAULT_PREVIEW_LIMIT,
): string {
  const normalizedValue = value.replace(/\s+/g, ' ').trim()
  if (normalizedValue.length <= limit) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, limit).trim()}...`
}

export function normalizeSourceItems(items: SourceItem[]): SourceItem[] {
  const seenReferenceNumbers = new Set<number>()
  const uniqueItems: SourceItem[] = []

  for (const item of items) {
    if (seenReferenceNumbers.has(item.referenceNumber)) {
      continue
    }

    seenReferenceNumbers.add(item.referenceNumber)
    uniqueItems.push(item)
  }

  return uniqueItems.sort((left, right) => {
    return left.referenceNumber - right.referenceNumber
  })
}

function filterSourceItemsByCitedNumbers(
  items: SourceItem[],
  citedReferenceNumbers: number[],
): SourceItem[] {
  if (citedReferenceNumbers.length === 0) {
    return []
  }

  const citedNumberSet = new Set(citedReferenceNumbers)
  return items.filter((item) => citedNumberSet.has(item.referenceNumber))
}

function hasDisplayableReferences(message: CitationMessage): boolean {
  return message.references.length > 0 && (message.citedReferenceNumbers?.length ?? 0) > 0
}
