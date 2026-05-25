import { computed, ref } from 'vue'

import {
  getRagflowConfig,
  listRagflowModels,
  updateRagflowChatConfig,
} from '../lib/integration-api'
import { toFriendlyMessage } from '../lib/workspace-errors'
import type {
  RagflowChatConfig,
  RagflowDatasetConfig,
  RagflowModelOption,
} from '../types/integration'

export interface ModelOption {
  label: string
  value: string
}

export function useRagflowConfiguration() {
  const isLoadingConfig = ref<boolean>(false)
  const isSavingConfig = ref<boolean>(false)
  const configErrorMessage = ref<string>('')
  const datasets = ref<RagflowDatasetConfig[]>([])
  const chats = ref<RagflowChatConfig[]>([])
  const availableModels = ref<RagflowModelOption[]>([])
  const selectedChatId = ref<string>('')
  const selectedDatasetIds = ref<string[]>([])
  const configLlmId = ref<string>('')

  const selectedChat = computed(() => {
    return chats.value.find((chat) => chat.biz_chat_id === selectedChatId.value) ?? null
  })

  const hasAvailableChat = computed(() => {
    return chats.value.length > 0 && selectedChat.value !== null
  })

  const modelOptions = computed<ModelOption[]>(() => {
    const options: ModelOption[] = []
    const seenValues = new Set<string>()
    const addOption = (label: string, value: string): void => {
      const normalizedValue = value.trim()
      if (!normalizedValue || seenValues.has(normalizedValue)) {
        return
      }

      seenValues.add(normalizedValue)
      options.push({
        label: label.trim() || normalizedValue,
        value: normalizedValue,
      })
    }

    addOption(configLlmId.value, configLlmId.value)
    for (const model of availableModels.value) {
      addOption(model.label, model.model_id)
    }
    for (const chat of chats.value) {
      addOption(chat.llm_id, chat.llm_id)
    }

    return options
  })

  function applyConfig(config: {
    datasets: RagflowDatasetConfig[]
    chats: RagflowChatConfig[]
  }): void {
    datasets.value = config.datasets
    chats.value = config.chats
  }

  function replaceChat(updatedChat: RagflowChatConfig): void {
    chats.value = chats.value.map((chat) => {
      return chat.biz_chat_id === updatedChat.biz_chat_id ? updatedChat : chat
    })
    selectedChatId.value = updatedChat.biz_chat_id
    configLlmId.value = updatedChat.llm_id
  }

  function resetConfigState(): void {
    datasets.value = []
    chats.value = []
    availableModels.value = []
    selectedChatId.value = ''
    selectedDatasetIds.value = []
    configLlmId.value = ''
    configErrorMessage.value = ''
  }

  async function fetchConfig(): Promise<{
    datasets: RagflowDatasetConfig[]
    chats: RagflowChatConfig[]
  } | null> {
    configErrorMessage.value = ''
    isLoadingConfig.value = true

    try {
      const config = await getRagflowConfig()
      applyConfig(config)
      await loadModels()
      return config
    } catch (error: unknown) {
      configErrorMessage.value = toFriendlyMessage(error, 'Failed to load RAGFlow config.')
      return null
    } finally {
      isLoadingConfig.value = false
    }
  }

  async function loadModels(): Promise<void> {
    try {
      const response = await listRagflowModels()
      availableModels.value = response.models
    } catch (error: unknown) {
      availableModels.value = []
      configErrorMessage.value = toFriendlyMessage(error, 'Failed to load RAGFlow models.')
    }
  }

  async function saveKnowledgeConfig(): Promise<RagflowChatConfig | null> {
    if (!selectedChatId.value) {
      configErrorMessage.value = 'Select a RAGFlow assistant first.'
      return null
    }

    configErrorMessage.value = ''
    isSavingConfig.value = true

    try {
      const updatedChat = await updateRagflowChatConfig({
        biz_chat_id: selectedChatId.value,
        biz_knowledge_base_ids: selectedDatasetIds.value,
      })
      replaceChat(updatedChat)
      return updatedChat
    } catch (error: unknown) {
      configErrorMessage.value = toFriendlyMessage(error, 'Failed to save RAGFlow knowledge config.')
      return null
    } finally {
      isSavingConfig.value = false
    }
  }

  function toggleDataset(datasetId: string): void {
    if (selectedDatasetIds.value.includes(datasetId)) {
      selectedDatasetIds.value = selectedDatasetIds.value.filter((id) => id !== datasetId)
      return
    }

    selectedDatasetIds.value = [...selectedDatasetIds.value, datasetId]
  }

  async function saveModelConfig(modelId: string): Promise<RagflowChatConfig | null> {
    if (!selectedChatId.value) {
      configErrorMessage.value = 'Select a RAGFlow assistant first.'
      return null
    }

    configErrorMessage.value = ''
    isSavingConfig.value = true

    try {
      const updatedChat = await updateRagflowChatConfig({
        biz_chat_id: selectedChatId.value,
        biz_knowledge_base_ids: selectedDatasetIds.value,
        llm_id: modelId.trim() || undefined,
      })
      replaceChat(updatedChat)
      return updatedChat
    } catch (error: unknown) {
      configErrorMessage.value = toFriendlyMessage(error, 'Failed to save RAGFlow model config.')
      return null
    } finally {
      isSavingConfig.value = false
    }
  }

  return {
    applyConfig,
    availableModels,
    chats,
    configErrorMessage,
    configLlmId,
    datasets,
    fetchConfig,
    hasAvailableChat,
    isLoadingConfig,
    isSavingConfig,
    loadModels,
    modelOptions,
    replaceChat,
    resetConfigState,
    saveKnowledgeConfig,
    saveModelConfig,
    selectedChat,
    selectedChatId,
    selectedDatasetIds,
    toggleDataset,
  }
}
