import { computed, onBeforeUnmount, ref } from 'vue'

import { streamChat } from '../lib/integration-api'
import { toFriendlyMessage } from '../lib/workspace-errors'
import type { ChatReference } from '../types/integration'

const STREAMING_STATUS = 'Streaming'
const COMPLETED_STATUS = 'Complete'
const IDLE_STATUS = 'Idle'
const CANCELLED_STATUS = 'Cancelled'

export function useChatSession() {
  const activeChatAbortController = ref<AbortController | null>(null)
  const assistantName = ref<string>('Standard Assistant')
  const assistantChatId = ref<string>('')
  const sessionId = ref<string>('')
  const sessionName = ref<string>('Recent Chat 1')
  const question = ref<string>('')
  const submittedQuestion = ref<string>('')
  const streamedAnswer = ref<string>('')
  const streamedReferences = ref<ChatReference[]>([])
  const isStreamingChat = ref<boolean>(false)
  const errorCode = ref<string>('')
  const errorMessage = ref<string>('')
  const wasCancelled = ref<boolean>(false)

  const canSubmitChat = computed<boolean>(() => {
    return (
      assistantChatId.value.trim().length > 0 &&
      assistantName.value.trim().length > 0 &&
      question.value.trim().length > 0 &&
      !isStreamingChat.value
    )
  })

  const answerStatus = computed<string>(() => {
    if (isStreamingChat.value) {
      return STREAMING_STATUS
    }

    if (wasCancelled.value) {
      return CANCELLED_STATUS
    }

    if (streamedAnswer.value) {
      return COMPLETED_STATUS
    }

    return IDLE_STATUS
  })

  function clearError(): void {
    errorCode.value = ''
    errorMessage.value = ''
  }

  function cancelChat(): void {
    if (!activeChatAbortController.value) {
      return
    }

    wasCancelled.value = true
    activeChatAbortController.value.abort()
  }

  function resetChat(): void {
    activeChatAbortController.value?.abort()
    activeChatAbortController.value = null
    question.value = ''
    submittedQuestion.value = ''
    streamedAnswer.value = ''
    streamedReferences.value = []
    errorCode.value = ''
    errorMessage.value = ''
    isStreamingChat.value = false
    wasCancelled.value = false
  }

  function clearTransientAnswer(options: { keepReferences?: boolean } = {}): void {
    submittedQuestion.value = ''
    streamedAnswer.value = ''
    if (!options.keepReferences) {
      streamedReferences.value = []
    }
    errorCode.value = ''
    errorMessage.value = ''
  }

  async function submitChat(): Promise<void> {
    if (!canSubmitChat.value) {
      errorMessage.value = assistantChatId.value.trim()
        ? 'Please enter a question.'
        : 'Select an available RAGFlow assistant before chatting.'
      return
    }

    const trimmedQuestion = question.value.trim()
    question.value = ''
    clearError()
    wasCancelled.value = false
    isStreamingChat.value = true
    submittedQuestion.value = trimmedQuestion
    streamedAnswer.value = ''
    streamedReferences.value = []
    activeChatAbortController.value?.abort()
    activeChatAbortController.value = new AbortController()

    try {
      await streamChat(
        {
          assistant_name: assistantName.value.trim(),
          question: trimmedQuestion,
          biz_chat_id: assistantChatId.value.trim() || undefined,
          biz_session_id: sessionId.value.trim() || undefined,
          session_name: sessionName.value.trim() || undefined,
        },
        (chunk) => {
          if (chunk.error_code || chunk.error_message) {
            streamedAnswer.value = ''
            streamedReferences.value = []
            errorCode.value = chunk.error_code || ''
            errorMessage.value = chunk.error_message || 'Chat streaming failed.'
            return
          }

          streamedAnswer.value = chunk.answer
          streamedReferences.value = chunk.references
        },
        activeChatAbortController.value.signal,
      )
    } catch (error: unknown) {
      if (activeChatAbortController.value?.signal.aborted) {
        return
      }

      streamedAnswer.value = ''
      streamedReferences.value = []
      errorCode.value = ''
      errorMessage.value = toFriendlyMessage(error, 'Chat streaming failed.')
    } finally {
      activeChatAbortController.value = null
      isStreamingChat.value = false
    }
  }

  onBeforeUnmount(() => {
    activeChatAbortController.value?.abort()
  })

  return {
    answerStatus,
    assistantChatId,
    assistantName,
    cancelChat,
    canSubmitChat,
    clearError,
    clearTransientAnswer,
    errorCode,
    errorMessage,
    isStreamingChat,
    question,
    resetChat,
    sessionId,
    sessionName,
    submittedQuestion,
    streamedAnswer,
    streamedReferences,
    submitChat,
  }
}
