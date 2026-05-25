import { computed, onBeforeUnmount, ref } from 'vue'

import { streamChat } from '../lib/integration-api'
import { isDraftSessionId } from '../lib/session-list'
import { toFriendlyMessage } from '../lib/workspace-errors'
import type { ChatReference } from '../types/integration'

const STREAMING_STATUS = 'Streaming'
const COMPLETED_STATUS = 'Complete'
const IDLE_STATUS = 'Idle'
const CANCELLED_STATUS = 'Cancelled'

export function useChatSession() {
  const activeChatAbortController = ref<AbortController | null>(null)
  const activeChatRequestId = ref<number>(0)
  const assistantName = ref<string>('Standard Assistant')
  const assistantChatId = ref<string>('')
  const sessionId = ref<string>('')
  const sessionName = ref<string>('')
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
    activeChatRequestId.value += 1
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

  function isActiveChatRequest(requestId: number, controller: AbortController): boolean {
    return (
      activeChatRequestId.value === requestId &&
      activeChatAbortController.value === controller
    )
  }

  async function submitChat(): Promise<boolean> {
    if (!canSubmitChat.value) {
      errorMessage.value = assistantChatId.value.trim()
        ? 'Please enter a question.'
        : 'Select an available RAGFlow assistant before chatting.'
      return false
    }

    const trimmedQuestion = question.value.trim()
    activeChatAbortController.value?.abort()
    const requestId = activeChatRequestId.value + 1
    const controller = new AbortController()
    activeChatRequestId.value = requestId
    activeChatAbortController.value = controller
    question.value = ''
    clearError()
    wasCancelled.value = false
    isStreamingChat.value = true
    submittedQuestion.value = trimmedQuestion
    streamedAnswer.value = ''
    streamedReferences.value = []

    try {
      const activeSessionId = sessionId.value.trim()
      await streamChat(
        {
          assistant_name: assistantName.value.trim(),
          question: trimmedQuestion,
          biz_chat_id: assistantChatId.value.trim() || undefined,
          biz_session_id: activeSessionId && !isDraftSessionId(activeSessionId)
            ? activeSessionId
            : undefined,
        },
        (chunk) => {
          if (!isActiveChatRequest(requestId, controller)) {
            return
          }

          if (chunk.error_code || chunk.error_message) {
            streamedAnswer.value = ''
            streamedReferences.value = []
            errorCode.value = chunk.error_code || ''
            errorMessage.value = chunk.error_message || 'Chat streaming failed.'
            return
          }

          streamedAnswer.value = chunk.answer
          streamedReferences.value = chunk.references
          if (chunk.session_name) {
            sessionName.value = chunk.session_name
          }
          if (chunk.biz_session_id) {
            sessionId.value = chunk.biz_session_id
          }
        },
        controller.signal,
      )
      return isActiveChatRequest(requestId, controller) && !controller.signal.aborted
    } catch (error: unknown) {
      if (controller.signal.aborted || !isActiveChatRequest(requestId, controller)) {
        return false
      }

      streamedAnswer.value = ''
      streamedReferences.value = []
      errorCode.value = ''
      errorMessage.value = toFriendlyMessage(error, 'Chat streaming failed.')
      return true
    } finally {
      if (isActiveChatRequest(requestId, controller)) {
        activeChatAbortController.value = null
        isStreamingChat.value = false
      }
    }
  }

  onBeforeUnmount(() => {
    activeChatAbortController.value?.abort()
    activeChatRequestId.value += 1
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
