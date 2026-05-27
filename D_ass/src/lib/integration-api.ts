import { IntegrationApiError, openSseStream, requestBlob, requestJson } from './api-client'
import type {
  ChatReference,
  ChatRequest,
  ChatResponse,
  DeleteRagflowSessionResponse,
  FileChunkPreviewResponse,
  HealthResponse,
  KnowledgeFileContentResponse,
  KnowledgeFileDetailResponse,
  ListKnowledgeFilesResponse,
  ListRagflowModelsResponse,
  ListRagflowSessionsResponse,
  RagflowChatConfig,
  RagflowConfigResponse,
  RagflowDatasetConfig,
  RagflowModelOption,
  RagflowSession,
  RagflowSessionMessage,
  UpdateRagflowChatConfigPayload,
  UpdateRagflowSessionPayload,
  UploadKnowledgeFilePayload,
  UploadKnowledgeFileResponse,
} from '../types/integration'
import { isRecord, isStringArray, parseNullableString } from './integration-parsers'

export {
  getAuthConfig,
  getAuthUser,
  loginWithRagflow,
  logoutFromRagflow,
  registerWithRagflow,
} from './auth-api'

interface SseEvent {
  event: string
  data: string
}

const DONE_EVENT_NAME = 'done'
const DONE_EVENT_PAYLOAD = '[DONE]'

function isChatReference(value: unknown): value is ChatReference {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.biz_file_id === 'string' &&
    typeof value.biz_file_name === 'string' &&
    typeof value.chunk_content === 'string' &&
    (
      typeof value.reference_number === 'number' ||
      value.reference_number === null ||
      typeof value.reference_number === 'undefined'
    ) &&
    typeof value.similarity_score === 'number'
  )
}

function parseChatReference(value: unknown): ChatReference {
  if (!isChatReference(value)) {
    throw new IntegrationApiError('invalid_response', 'Invalid citation response.')
  }

  return {
    biz_file_id: value.biz_file_id,
    biz_file_name: value.biz_file_name,
    chunk_content: value.chunk_content,
    reference_number: typeof value.reference_number === 'number'
      ? value.reference_number
      : null,
    similarity_score: value.similarity_score,
  }
}

function parseHealthResponse(value: unknown): HealthResponse {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new IntegrationApiError('invalid_response', 'Invalid health response.')
  }

  return {
    status: value.status,
  }
}

function parseUploadKnowledgeFileResponse(value: unknown): UploadKnowledgeFileResponse {
  if (
    !isRecord(value) ||
    typeof value.knowledge_base_name !== 'string' ||
    typeof value.biz_file_id !== 'string' ||
    typeof value.biz_file_name !== 'string' ||
    typeof value.parse_status !== 'string' ||
    typeof value.chunk_count !== 'number' ||
    typeof value.token_count !== 'number'
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid upload response.')
  }

  return {
    knowledge_base_name: value.knowledge_base_name,
    biz_file_id: value.biz_file_id,
    biz_file_name: value.biz_file_name,
    parse_status: value.parse_status,
    parse_message: parseNullableString(value.parse_message),
    chunk_count: value.chunk_count,
    token_count: value.token_count,
  }
}

function parseListKnowledgeFilesResponse(value: unknown): ListKnowledgeFilesResponse {
  if (
    !isRecord(value) ||
    typeof value.knowledge_base_name !== 'string' ||
    !Array.isArray(value.files)
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid file list response.')
  }

  return {
    knowledge_base_name: value.knowledge_base_name,
    files: value.files.map((file) => parseUploadKnowledgeFileResponse(file)),
  }
}

function parseFileChunkPreviewResponse(value: unknown): FileChunkPreviewResponse {
  if (
    !isRecord(value) ||
    typeof value.sequence !== 'number' ||
    typeof value.content !== 'string'
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid chunk preview response.')
  }

  return {
    sequence: value.sequence,
    content: value.content,
  }
}

function parseKnowledgeFileDetailResponse(value: unknown): KnowledgeFileDetailResponse {
  if (
    !isRecord(value) ||
    typeof value.knowledge_base_name !== 'string' ||
    typeof value.biz_file_id !== 'string' ||
    typeof value.biz_file_name !== 'string' ||
    typeof value.parse_status !== 'string' ||
    typeof value.chunk_count !== 'number' ||
    typeof value.token_count !== 'number' ||
    !Array.isArray(value.chunks)
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid file detail response.')
  }

  return {
    knowledge_base_name: value.knowledge_base_name,
    biz_file_id: value.biz_file_id,
    biz_file_name: value.biz_file_name,
    parse_status: value.parse_status,
    parse_message: parseNullableString(value.parse_message),
    chunk_count: value.chunk_count,
    token_count: value.token_count,
    chunks: value.chunks.map((chunk) => parseFileChunkPreviewResponse(chunk)),
  }
}

function parseChatResponse(value: unknown): ChatResponse {
  if (!isRecord(value) || typeof value.answer !== 'string') {
    throw new IntegrationApiError('invalid_response', 'Invalid chat stream response.')
  }

  const references = value.references
  if (!Array.isArray(references)) {
    throw new IntegrationApiError('invalid_response', 'Invalid citation response.')
  }

  return {
    answer: value.answer,
    references: references.map((reference) => parseChatReference(reference)),
    biz_session_id: parseNullableString(value.biz_session_id),
    session_name: parseNullableString(value.session_name),
    error_code: parseNullableString(value.error_code),
    error_message: parseNullableString(value.error_message),
  }
}

function parseRagflowDatasetConfig(value: unknown): RagflowDatasetConfig {
  if (
    !isRecord(value) ||
    typeof value.biz_knowledge_base_id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.embedding_model !== 'string' ||
    typeof value.chunk_method !== 'string' ||
    typeof value.document_count !== 'number' ||
    typeof value.chunk_count !== 'number' ||
    !isRecord(value.parser_config)
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow dataset config response.')
  }

  return {
    biz_knowledge_base_id: value.biz_knowledge_base_id,
    name: value.name,
    embedding_model: value.embedding_model,
    chunk_method: value.chunk_method,
    document_count: value.document_count,
    chunk_count: value.chunk_count,
    parser_config: value.parser_config,
  }
}

function parseRagflowChatConfig(value: unknown): RagflowChatConfig {
  if (
    !isRecord(value) ||
    typeof value.biz_chat_id !== 'string' ||
    typeof value.name !== 'string' ||
    !isStringArray(value.biz_knowledge_base_ids) ||
    !isStringArray(value.kb_names) ||
    typeof value.llm_id !== 'string' ||
    typeof value.similarity_threshold !== 'number' ||
    typeof value.vector_similarity_weight !== 'number' ||
    typeof value.top_k !== 'number' ||
    typeof value.top_n !== 'number' ||
    typeof value.rerank_id !== 'string' ||
    !isRecord(value.prompt_config)
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow assistant config response.')
  }

  return {
    biz_chat_id: value.biz_chat_id,
    name: value.name,
    biz_knowledge_base_ids: value.biz_knowledge_base_ids,
    kb_names: value.kb_names,
    llm_id: value.llm_id,
    similarity_threshold: value.similarity_threshold,
    vector_similarity_weight: value.vector_similarity_weight,
    top_k: value.top_k,
    top_n: value.top_n,
    rerank_id: value.rerank_id,
    prompt_config: value.prompt_config,
  }
}

function parseRagflowConfigResponse(value: unknown): RagflowConfigResponse {
  if (!isRecord(value) || !Array.isArray(value.datasets) || !Array.isArray(value.chats)) {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow config response.')
  }

  return {
    datasets: value.datasets.map((dataset) => parseRagflowDatasetConfig(dataset)),
    chats: value.chats.map((chat) => parseRagflowChatConfig(chat)),
  }
}

function parseRagflowModelOption(value: unknown): RagflowModelOption {
  if (
    !isRecord(value) ||
    typeof value.model_id !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.source !== 'string'
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow model response.')
  }

  return {
    model_id: value.model_id,
    label: value.label,
    source: value.source,
  }
}

function parseListRagflowModelsResponse(value: unknown): ListRagflowModelsResponse {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow model list response.')
  }

  return {
    models: value.models.map((model) => parseRagflowModelOption(model)),
  }
}

function parseRagflowSessionMessage(value: unknown): RagflowSessionMessage | null {
  if (!isRecord(value) || typeof value.role !== 'string' || typeof value.content !== 'string') {
    return null
  }

  if (value.role !== 'user' && value.role !== 'assistant') {
    return null
  }

  const references = Array.isArray(value.references)
    ? value.references
      .map((reference) => {
        try {
          return parseChatReference(reference)
        } catch {
          return null
        }
      })
      .filter((reference): reference is ChatReference => reference !== null)
    : []

  return {
    role: value.role,
    content: value.content,
    references,
  }
}

function parseRagflowSession(value: unknown): RagflowSession {
  if (
    !isRecord(value) ||
    typeof value.biz_session_id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.biz_chat_id !== 'string' ||
    !Array.isArray(value.messages)
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow session response.')
  }

  return {
    biz_session_id: value.biz_session_id,
    name: value.name,
    biz_chat_id: value.biz_chat_id,
    messages: value.messages
      .map((message) => parseRagflowSessionMessage(message))
      .filter((message): message is RagflowSessionMessage => message !== null),
  }
}

function parseListRagflowSessionsResponse(value: unknown): ListRagflowSessionsResponse {
  if (!isRecord(value) || !Array.isArray(value.sessions)) {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow session list response.')
  }

  return {
    sessions: value.sessions.map((session) => parseRagflowSession(session)),
  }
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return null
  }

  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }

  return {
    event,
    data: dataLines.join('\n'),
  }
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await requestJson<unknown>('/health', {
    method: 'GET',
  })
  return parseHealthResponse(response)
}

export async function getRagflowConfig(): Promise<RagflowConfigResponse> {
  const response = await requestJson<unknown>('/api/ragflow/config', {
    method: 'GET',
  })
  return parseRagflowConfigResponse(response)
}

export async function listRagflowModels(): Promise<ListRagflowModelsResponse> {
  const response = await requestJson<unknown>('/api/ragflow/models', {
    method: 'GET',
  })
  return parseListRagflowModelsResponse(response)
}

export async function listRagflowChatSessions(
  chatId: string,
): Promise<ListRagflowSessionsResponse> {
  const response = await requestJson<unknown>(`/api/ragflow/chats/${chatId}/sessions`, {
    method: 'GET',
  })
  return parseListRagflowSessionsResponse(response)
}

export async function updateRagflowChatSession(
  chatId: string,
  sessionId: string,
  payload: UpdateRagflowSessionPayload,
): Promise<RagflowSession> {
  const response = await requestJson<unknown>(
    `/api/ragflow/chats/${chatId}/sessions/${sessionId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )
  return parseRagflowSession(response)
}

export async function deleteRagflowChatSession(
  chatId: string,
  sessionId: string,
): Promise<DeleteRagflowSessionResponse> {
  const response = await requestJson<unknown>(
    `/api/ragflow/chats/${chatId}/sessions/${sessionId}`,
    {
      method: 'DELETE',
    },
  )
  if (!isRecord(response) || typeof response.deleted !== 'boolean') {
    throw new IntegrationApiError('invalid_response', 'Invalid RAGFlow delete response.')
  }
  return {
    deleted: response.deleted,
  }
}

export async function updateRagflowChatConfig(
  payload: UpdateRagflowChatConfigPayload,
): Promise<RagflowChatConfig> {
  const response = await requestJson<unknown>('/api/ragflow/chats/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  return parseRagflowChatConfig(response)
}

export async function uploadKnowledgeFile(
  payload: UploadKnowledgeFilePayload,
): Promise<UploadKnowledgeFileResponse> {
  const formData = new FormData()
  formData.append('knowledge_base_name', payload.knowledge_base_name)
  formData.append('biz_file_id', payload.biz_file_id)
  formData.append('biz_file_name', payload.biz_file_name)
  formData.append('file', payload.file)

  const response = await requestJson<unknown>('/api/files', {
    method: 'POST',
    body: formData,
  })
  return parseUploadKnowledgeFileResponse(response)
}

export async function listKnowledgeFiles(
  knowledgeBaseName: string,
): Promise<ListKnowledgeFilesResponse> {
  const searchParams = new URLSearchParams({
    knowledge_base_name: knowledgeBaseName,
  })
  const response = await requestJson<unknown>(`/api/files?${searchParams.toString()}`, {
    method: 'GET',
  })
  return parseListKnowledgeFilesResponse(response)
}

export async function getKnowledgeFileDetail(
  knowledgeBaseName: string,
  bizFileId: string,
): Promise<KnowledgeFileDetailResponse> {
  const searchParams = new URLSearchParams({
    knowledge_base_name: knowledgeBaseName,
    biz_file_id: bizFileId,
  })
  const response = await requestJson<unknown>(
    `/api/files/detail?${searchParams.toString()}`,
    {
      method: 'GET',
    },
  )
  return parseKnowledgeFileDetailResponse(response)
}

export async function getKnowledgeFileContent(
  knowledgeBaseName: string,
  bizFileId: string,
): Promise<KnowledgeFileContentResponse> {
  const searchParams = new URLSearchParams({
    knowledge_base_name: knowledgeBaseName,
    biz_file_id: bizFileId,
  })
  const response = await requestBlob(
    `/api/files/content?${searchParams.toString()}`,
    {
      method: 'GET',
    },
  )
  return {
    blob: response.blob,
    mediaType: response.mediaType,
  }
}

export async function streamChat(
  payload: ChatRequest,
  onChunk: (chunk: ChatResponse) => void,
  signal?: AbortSignal,
): Promise<void> {
  let hasReceivedChunk = false

  try {
    await streamChatWithSse(
      payload,
      (chunk) => {
        hasReceivedChunk = true
        onChunk(chunk)
      },
      signal,
    )
  } catch (error: unknown) {
    if (signal?.aborted || hasReceivedChunk) {
      throw error
    }

    const fallbackResponse = await completeChat(payload, signal)
    onChunk(fallbackResponse)
  }
}

async function streamChatWithSse(
  payload: ChatRequest,
  onChunk: (chunk: ChatResponse) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = await openSseStream('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  })

  const textDecoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        return
      }

      buffer += textDecoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      if (processSseBlocks(blocks, onChunk)) {
        return
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function processSseBlocks(
  blocks: string[],
  onChunk: (chunk: ChatResponse) => void,
): boolean {
  for (const block of blocks) {
    const event = parseSseBlock(block)
    if (!event) {
      continue
    }

    if (event.event === DONE_EVENT_NAME || event.data === DONE_EVENT_PAYLOAD) {
      return true
    }

    let payload: unknown
    try {
      payload = JSON.parse(event.data) as unknown
    } catch {
      throw new IntegrationApiError('invalid_response', 'Stream chunk was not valid JSON.')
    }

    onChunk(parseChatResponse(payload))
  }

  return false
}

async function completeChat(
  payload: ChatRequest,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const response = await requestJson<unknown>('/api/chat/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseChatResponse(response)
}
