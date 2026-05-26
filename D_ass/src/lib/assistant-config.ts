import type {
  AssistantTuningDraft,
  RagflowChatConfig,
} from '../types/integration'

export function createEmptyAssistantTuningDraft(): AssistantTuningDraft {
  return {
    llmId: '',
    similarityThreshold: 0.1,
    vectorSimilarityWeight: 0.3,
    topK: 1024,
    topN: 6,
    rerankId: '',
    promptSystem: '',
    emptyResponse: '',
    quote: true,
  }
}

export function toAssistantTuningDraft(chat: RagflowChatConfig): AssistantTuningDraft {
  const promptConfig = chat.prompt_config
  return {
    llmId: chat.llm_id,
    similarityThreshold: clampConfigNumber(chat.similarity_threshold, 0, 1, 0.1),
    vectorSimilarityWeight: clampConfigNumber(chat.vector_similarity_weight, 0, 1, 0.3),
    topK: clampConfigNumber(chat.top_k, 1, 10000, 1024),
    topN: clampConfigNumber(chat.top_n, 1, 100, 6),
    rerankId: chat.rerank_id,
    promptSystem: readPromptString(promptConfig, 'system') || readPromptString(promptConfig, 'prompt'),
    emptyResponse: readPromptString(promptConfig, 'empty_response'),
    quote: readPromptBoolean(promptConfig, 'quote', true),
  }
}

function clampConfigNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, value))
}

function readPromptString(promptConfig: Record<string, unknown>, key: string): string {
  const value = promptConfig[key]
  return typeof value === 'string' ? value : ''
}

function readPromptBoolean(
  promptConfig: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = promptConfig[key]
  return typeof value === 'boolean' ? value : fallback
}
