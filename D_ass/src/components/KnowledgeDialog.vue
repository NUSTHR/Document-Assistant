<script setup lang="ts">
import { computed } from 'vue'

import type { ModelOption } from '../composables/useRagflowConfiguration'
import type {
  RagflowChatConfig,
  RagflowDatasetConfig,
  UpdateRagflowChatConfigPayload,
} from '../types/integration'

interface AssistantTuningDraft {
  llmId: string
  similarityThreshold: number
  vectorSimilarityWeight: number
  topK: number
  topN: number
  rerankId: string
  promptSystem: string
  emptyResponse: string
  quote: boolean
}

const props = defineProps<{
  chats: RagflowChatConfig[]
  configErrorMessage: string
  datasets: RagflowDatasetConfig[]
  hasAvailableChat: boolean
  isLoadingConfig: boolean
  isSavingConfig: boolean
  modelOptions: ModelOption[]
  selectedChatId: string
  selectedDatasetIds: string[]
  tuningDraft: AssistantTuningDraft
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'load-config'): void
  (event: 'save-config', payload: Omit<UpdateRagflowChatConfigPayload, 'biz_chat_id'>): void
  (event: 'toggle-dataset', datasetId: string): void
  (event: 'update:selectedChatId', value: string): void
  (event: 'update:tuningDraft', value: AssistantTuningDraft): void
}>()

const selectedChatIdModel = computed<string>({
  get: () => props.selectedChatId,
  set: (value) => emit('update:selectedChatId', value),
})

const datasetCountLabel = computed(() => {
  const selectedCount = props.selectedDatasetIds.length
  if (selectedCount === 0) {
    return 'No knowledge base selected'
  }
  if (selectedCount === 1) {
    return '1 knowledge base selected'
  }
  return `${selectedCount} knowledge bases selected`
})

function patchDraft(patch: Partial<AssistantTuningDraft>): void {
  emit('update:tuningDraft', {
    ...props.tuningDraft,
    ...patch,
  })
}

function parseNumberInput(value: string, fallback: number): number {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function setNumberDraft(
  key: 'similarityThreshold' | 'vectorSimilarityWeight' | 'topK' | 'topN',
  rawValue: string,
): void {
  const currentValue = props.tuningDraft[key]
  const parsedValue = parseNumberInput(rawValue, currentValue)
  const boundsByKey: Record<
    'similarityThreshold' | 'vectorSimilarityWeight' | 'topK' | 'topN',
    readonly [number, number]
  > = {
    similarityThreshold: [0, 1],
    vectorSimilarityWeight: [0, 1],
    topK: [1, 10000],
    topN: [1, 100],
  }
  const bounds = boundsByKey[key]
  patchDraft({
    [key]: clampNumber(parsedValue, bounds[0], bounds[1]),
  } as Partial<AssistantTuningDraft>)
}

function saveConfig(): void {
  emit('save-config', {
    biz_knowledge_base_ids: props.selectedDatasetIds,
    llm_id: props.tuningDraft.llmId.trim() || undefined,
    similarity_threshold: props.tuningDraft.similarityThreshold,
    vector_similarity_weight: props.tuningDraft.vectorSimilarityWeight,
    top_k: Math.round(props.tuningDraft.topK),
    top_n: Math.round(props.tuningDraft.topN),
    rerank_id: props.tuningDraft.rerankId.trim(),
    prompt_system: props.tuningDraft.promptSystem,
    empty_response: props.tuningDraft.emptyResponse,
    quote: props.tuningDraft.quote,
  })
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')">
    <section class="dialog-panel dialog-panel--wide">
      <header class="dialog-header">
        <div>
          <p>Assistant Control</p>
          <h2>RAGFlow Agent Configuration</h2>
        </div>
        <button type="button" class="dialog-close" @click="emit('close')">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <div class="settings-grid assistant-config-grid">
        <label>
          <span>Assistant</span>
          <select v-model="selectedChatIdModel">
            <option value="" disabled>
              No assistant available
            </option>
            <option v-for="chat in chats" :key="chat.biz_chat_id" :value="chat.biz_chat_id">
              {{ chat.name }}
            </option>
          </select>
        </label>
        <label>
          <span>Model</span>
          <select
            :value="tuningDraft.llmId"
            @change="patchDraft({ llmId: ($event.target as HTMLSelectElement).value })"
          >
            <option value="">
              Use RAGFlow default model
            </option>
            <option v-for="model in modelOptions" :key="model.value" :value="model.value">
              {{ model.label }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="configErrorMessage" class="dialog-error">{{ configErrorMessage }}</p>

      <div class="assistant-config-layout">
        <section class="assistant-config-section">
          <div class="assistant-section-title">
            <span class="material-symbols-outlined">database</span>
            <div>
              <h3>Knowledge Bases</h3>
              <p>{{ datasetCountLabel }}</p>
            </div>
          </div>
          <div class="dataset-list dataset-list--compact">
            <label
              v-for="dataset in datasets"
              :key="dataset.biz_knowledge_base_id"
              class="dataset-option"
            >
              <input
                type="checkbox"
                :checked="selectedDatasetIds.includes(dataset.biz_knowledge_base_id)"
                @change="emit('toggle-dataset', dataset.biz_knowledge_base_id)"
              />
              <span>
                <strong>{{ dataset.name }}</strong>
                <small>{{ dataset.embedding_model || 'No embedding model' }} | {{ dataset.document_count }} docs | {{ dataset.chunk_count }} chunks</small>
              </span>
            </label>
            <p v-if="datasets.length === 0" class="assistant-empty-state">
              No knowledge bases are available for this RAGFlow user.
            </p>
          </div>
        </section>

        <section class="assistant-config-section">
          <div class="assistant-section-title">
            <span class="material-symbols-outlined">tune</span>
            <div>
              <h3>Retrieval Parameters</h3>
              <p>Controls how the selected Agent searches and quotes sources.</p>
            </div>
          </div>
          <div class="parameter-grid">
            <label class="parameter-control">
              <span>Similarity Threshold</span>
              <strong>{{ tuningDraft.similarityThreshold.toFixed(2) }}</strong>
              <input
                :value="tuningDraft.similarityThreshold"
                max="1"
                min="0"
                step="0.01"
                type="range"
                @input="setNumberDraft('similarityThreshold', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="parameter-control">
              <span>Vector Weight</span>
              <strong>{{ tuningDraft.vectorSimilarityWeight.toFixed(2) }}</strong>
              <input
                :value="tuningDraft.vectorSimilarityWeight"
                max="1"
                min="0"
                step="0.01"
                type="range"
                @input="setNumberDraft('vectorSimilarityWeight', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="parameter-control">
              <span>Top K</span>
              <input
                :value="tuningDraft.topK"
                max="10000"
                min="1"
                step="1"
                type="number"
                @input="setNumberDraft('topK', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="parameter-control">
              <span>Top N</span>
              <input
                :value="tuningDraft.topN"
                max="100"
                min="1"
                step="1"
                type="number"
                @input="setNumberDraft('topN', ($event.target as HTMLInputElement).value)"
              />
            </label>
            <label class="parameter-control parameter-control--wide">
              <span>Rerank Model</span>
              <input
                :value="tuningDraft.rerankId"
                placeholder="Leave blank to disable rerank"
                type="text"
                @input="patchDraft({ rerankId: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <label class="parameter-toggle">
              <input
                type="checkbox"
                :checked="tuningDraft.quote"
                @change="patchDraft({ quote: ($event.target as HTMLInputElement).checked })"
              />
              <span>
                <strong>Show Citations</strong>
                <small>Return source quote markers when RAGFlow finds supporting chunks.</small>
              </span>
            </label>
          </div>
        </section>

        <section class="assistant-config-section assistant-config-section--prompt">
          <div class="assistant-section-title">
            <span class="material-symbols-outlined">edit_note</span>
            <div>
              <h3>Prompt Behavior</h3>
              <p>System instruction and fallback response for this Agent.</p>
            </div>
          </div>
          <label class="prompt-field">
            <span>System Prompt</span>
            <textarea
              :value="tuningDraft.promptSystem"
              rows="7"
              @input="patchDraft({ promptSystem: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="prompt-field">
            <span>Empty Response</span>
            <textarea
              :value="tuningDraft.emptyResponse"
              rows="3"
              @input="patchDraft({ emptyResponse: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
        </section>
      </div>

      <div class="dialog-actions">
        <button type="button" class="dialog-action" :disabled="isLoadingConfig" @click="emit('load-config')">
          {{ isLoadingConfig ? 'Loading...' : 'Refresh RAGFlow Config' }}
        </button>
        <button
          type="button"
          class="dialog-action dialog-action--primary"
          :disabled="isSavingConfig || !hasAvailableChat"
          @click="saveConfig"
        >
          {{ isSavingConfig ? 'Saving...' : 'Save Agent Config' }}
        </button>
      </div>
    </section>
  </div>
</template>
