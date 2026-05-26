import { computed, type ComputedRef, type Ref } from 'vue'

import {
  contentsAreEquivalent,
  splitThoughtContent,
  type AnswerPresentation,
} from '../lib/chat-presentation'
import {
  extractCitedReferenceNumbers,
  resolveReferenceNumbers,
} from '../lib/citation-sources'
import { toAnswerSegments } from '../lib/workspace-presenters'
import type { RagflowSession } from '../types/integration'
import type { TranscriptMessage } from '../types/chat'

interface UseChatPresentationInput {
  chatErrorMessage: Ref<string>
  isStreamingChat: Ref<boolean>
  selectedSession: ComputedRef<RagflowSession | null>
  streamedAnswer: Ref<string>
  submittedQuestion: Ref<string>
}

export function useChatPresentation(input: UseChatPresentationInput) {
  const transcriptMessages = computed<TranscriptMessage[]>(() => {
    const selectedSession = input.selectedSession.value
    const rawMessages = selectedSession?.messages ?? []
    return rawMessages.flatMap((message, index) => {
      const role = String(message.role ?? '')
      const content = String(message.content ?? '').trim()
      if ((role !== 'user' && role !== 'assistant') || !content) {
        return []
      }
      const presentation = splitThoughtContent(content)
      const answerSegments = toAnswerSegments(presentation.answer)
      const citedReferenceNumbers = extractCitedReferenceNumbers(answerSegments)
      const references = message.references ?? []

      return [
        {
          id: `${selectedSession?.biz_session_id ?? 'session'}-${index}`,
          role,
          content,
          answerContent: presentation.answer,
          thoughtContent: presentation.thought,
          hasThought: presentation.hasThought,
          references,
          referenceNumbers: resolveReferenceNumbers(answerSegments, references.length),
          citedReferenceNumbers,
          answerSegments,
        } satisfies TranscriptMessage,
      ]
    })
  })

  const liveAnswerPresentation = computed<AnswerPresentation>(() => {
    return splitThoughtContent(input.streamedAnswer.value)
  })

  const liveAnswerSegments = computed(() => {
    return toAnswerSegments(liveAnswerPresentation.value.answer)
  })

  const answerIsError = computed(() => {
    return input.streamedAnswer.value.startsWith('ERROR:')
  })

  const shouldShowAnswer = computed(() => {
    return input.streamedAnswer.value.length > 0
  })

  const isLiveThinkingOnly = computed(() => {
    return (
      input.isStreamingChat.value &&
      liveAnswerPresentation.value.hasThought &&
      liveAnswerPresentation.value.answer.length === 0
    )
  })

  const liveAnswerIsStreaming = computed(() => {
    return (
      input.isStreamingChat.value &&
      shouldShowAnswer.value &&
      !input.chatErrorMessage.value &&
      !answerIsError.value
    )
  })

  const displayedTranscriptMessages = computed<TranscriptMessage[]>(() => {
    const duplicateIds = new Set<string>()
    const liveAnswer = input.chatErrorMessage.value || input.streamedAnswer.value
    let matchedQuestion = false
    let matchedAnswer = false

    for (let index = transcriptMessages.value.length - 1; index >= 0; index -= 1) {
      const message = transcriptMessages.value[index]
      if (!message) {
        continue
      }
      if (
        !matchedQuestion &&
        input.submittedQuestion.value &&
        message.role === 'user' &&
        contentsAreEquivalent(message.content, input.submittedQuestion.value)
      ) {
        duplicateIds.add(message.id)
        matchedQuestion = true
        continue
      }

      if (
        !matchedAnswer &&
        liveAnswer &&
        message.role === 'assistant' &&
        contentsAreEquivalent(message.content, liveAnswer)
      ) {
        duplicateIds.add(message.id)
        matchedAnswer = true
      }
    }

    return transcriptMessages.value.filter((message) => !duplicateIds.has(message.id))
  })

  function findMatchingTranscriptMessage(
    role: TranscriptMessage['role'],
    content: string,
  ): TranscriptMessage | null {
    for (let index = transcriptMessages.value.length - 1; index >= 0; index -= 1) {
      const message = transcriptMessages.value[index]
      if (message?.role === role && contentsAreEquivalent(message.content, content)) {
        return message
      }
    }

    return null
  }

  function sessionContainsExchange(questionText: string, answerText: string): boolean {
    if (!questionText || !answerText) {
      return false
    }

    const questionWasPersisted = Boolean(findMatchingTranscriptMessage('user', questionText))
    const answerWasPersisted = Boolean(findMatchingTranscriptMessage('assistant', answerText))

    return questionWasPersisted && answerWasPersisted
  }

  return {
    answerIsError,
    displayedTranscriptMessages,
    findMatchingTranscriptMessage,
    isLiveThinkingOnly,
    liveAnswerIsStreaming,
    liveAnswerPresentation,
    liveAnswerSegments,
    sessionContainsExchange,
    shouldShowAnswer,
    transcriptMessages,
  }
}
