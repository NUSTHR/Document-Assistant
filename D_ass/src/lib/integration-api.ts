import { IntegrationApiError, openSseStream, requestBlob, requestJson } from './api-client'
import type {
  ChatRequest,
  ChatResponse,
  ChatReference,
  FileChunkPreviewResponse,
  HealthResponse,
  KnowledgeFileContentResponse,
  KnowledgeFileDetailResponse,
  ListKnowledgeFilesResponse,
  UploadKnowledgeFilePayload,
  UploadKnowledgeFileResponse,
} from '../types/integration'

interface SseEvent {
  event: string
  data: string
}

const DONE_EVENT_NAME = 'done'
const DONE_EVENT_PAYLOAD = '[DONE]'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || typeof value === 'undefined') {
    return null
  }

  throw new IntegrationApiError('invalid_response', '解析状态详情格式不正确。')
}

function isChatReference(value: unknown): value is ChatReference {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.biz_file_id === 'string' &&
    typeof value.biz_file_name === 'string' &&
    typeof value.chunk_content === 'string' &&
    typeof value.similarity_score === 'number'
  )
}

function parseHealthResponse(value: unknown): HealthResponse {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new IntegrationApiError('invalid_response', '健康检查响应格式不正确。')
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
    throw new IntegrationApiError('invalid_response', '上传接口响应格式不正确。')
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
    throw new IntegrationApiError('invalid_response', '文件列表响应格式不正确。')
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
    throw new IntegrationApiError('invalid_response', '文件片段响应格式不正确。')
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
    throw new IntegrationApiError('invalid_response', '文件详情响应格式不正确。')
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
    throw new IntegrationApiError('invalid_response', '流式回答数据格式不正确。')
  }

  const references = value.references
  if (!Array.isArray(references) || !references.every(isChatReference)) {
    throw new IntegrationApiError('invalid_response', '引用数据格式不正确。')
  }

  return {
    answer: value.answer,
    references,
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
  const reader = await openSseStream('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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

      for (const block of blocks) {
        const event = parseSseBlock(block)
        if (!event) {
          continue
        }

        if (event.event === DONE_EVENT_NAME || event.data === DONE_EVENT_PAYLOAD) {
          return
        }

        let payload: unknown
        try {
          payload = JSON.parse(event.data) as unknown
        } catch {
          throw new IntegrationApiError('invalid_response', '流式回答不是有效 JSON。')
        }

        onChunk(parseChatResponse(payload))
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
