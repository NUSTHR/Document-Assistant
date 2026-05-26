import { ref } from 'vue'

import { normalizeAnswerForAction } from '../lib/chat-presentation'

export function useChatUiState() {
  const chatScrollElement = ref<HTMLElement | null>(null)
  const openThoughtIds = ref<string[]>([])
  const flashedActionKey = ref<string>('')

  function toggleThought(messageId: string): void {
    if (openThoughtIds.value.includes(messageId)) {
      openThoughtIds.value = openThoughtIds.value.filter((id) => id !== messageId)
      return
    }

    openThoughtIds.value = [...openThoughtIds.value, messageId]
  }

  async function copyAnswer(content: string): Promise<void> {
    const text = normalizeAnswerForAction(content)
    if (!text) {
      return
    }

    flashAction('copy')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // The visual confirmation still tells the user the action was attempted.
    }
  }

  function flashAction(actionKey: string): void {
    flashedActionKey.value = actionKey
    window.setTimeout(() => {
      if (flashedActionKey.value === actionKey) {
        flashedActionKey.value = ''
      }
    }, 420)
  }

  return {
    chatScrollElement,
    copyAnswer,
    flashedActionKey,
    openThoughtIds,
    toggleThought,
  }
}
