import { computed, onBeforeUnmount, ref } from 'vue'

import { streamChat } from '../lib/integration-api'
import { toFriendlyMessage } from '../lib/workspace-errors'
import type { ChatReference } from '../types/integration'

const STREAMING_STATUS = '流式回答中'
const COMPLETED_STATUS = '回答完成'
const IDLE_STATUS = '等待提问'
const CANCELLED_STATUS = '已取消'

export function useChatSession() {
  const activeChatAbortController = ref<AbortController | null>(null)
  const assistantName = ref<string>('')
  const sessionName = ref<string>('')
  const question = ref<string>('')
  const streamedAnswer = ref<string>('')
  const streamedReferences = ref<ChatReference[]>([])
  const isStreamingChat = ref<boolean>(false)
  const errorMessage = ref<string>('')
  const wasCancelled = ref<boolean>(false)

  const canSubmitChat = computed<boolean>(() => {
    return (
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
    errorMessage.value = ''
  }

  function cancelChat(): void {
    if (!activeChatAbortController.value) {
      return
    }

    wasCancelled.value = true
    activeChatAbortController.value.abort()
  }

  async function submitChat(): Promise<void> {
    if (!canSubmitChat.value) {
      errorMessage.value = '请先填写助手名称和提问内容。'
      return
    }

    clearError()
    wasCancelled.value = false
    isStreamingChat.value = true
    streamedAnswer.value = ''
    streamedReferences.value = []
    activeChatAbortController.value?.abort()
    activeChatAbortController.value = new AbortController()

    try {
      await streamChat(
        {
          assistant_name: assistantName.value.trim(),
          question: question.value.trim(),
          session_name: sessionName.value.trim() || undefined,
        },
        (chunk) => {
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
      errorMessage.value = toFriendlyMessage(error, '流式对话失败。')
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
    assistantName,
    cancelChat,
    canSubmitChat,
    clearError,
    errorMessage,
    isStreamingChat,
    question,
    sessionName,
    streamedAnswer,
    streamedReferences,
    submitChat,
  }
}
