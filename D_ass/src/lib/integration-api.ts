import { IntegrationApiError, openSseStream, requestBlob, requestJson } from './api-client'
import type {
  ChatRequest,
  ChatResponse,
  DeleteRagflowSessionResponse,
  HealthResponse,
  KnowledgeFileContentResponse,
  KnowledgeFileDetailResponse,
  ListKnowledgeFilesResponse,
  ListRagflowModelsResponse,
  ListRagflowSessionsResponse,
  RagflowChatConfig,
  RagflowConfigResponse,
  RagflowSession,
  UpdateRagflowChatConfigPayload,
  UpdateRagflowSessionPayload,
  UploadKnowledgeFilePayload,
  UploadKnowledgeFileResponse,
} from '../types/integration'
import {
  parseChatResponse,
  parseDeleteRagflowSessionResponse,
  parseHealthResponse,
  parseKnowledgeFileDetailResponse,
  parseListKnowledgeFilesResponse,
  parseListRagflowModelsResponse,
  parseListRagflowSessionsResponse,
  parseRagflowChatConfig,
  parseRagflowConfigResponse,
  parseRagflowSession,
  parseSseBlock,
  parseUploadKnowledgeFileResponse,
} from './integration-response-parsers'

export {
  getAuthConfig,
  getAuthUser,
  loginWithRagflow,
  logoutFromRagflow,
  registerWithRagflow,
} from './auth-api'

const DONE_EVENT_NAME = 'done'
const DONE_EVENT_PAYLOAD = '[DONE]'

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
  return parseDeleteRagflowSessionResponse(response)
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
