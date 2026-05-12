export interface HealthResponse {
  status: string
}

export interface UploadKnowledgeFilePayload {
  knowledge_base_name: string
  biz_file_id: string
  biz_file_name: string
  file: File
}

export interface UploadKnowledgeFileResponse {
  knowledge_base_name: string
  biz_file_id: string
  biz_file_name: string
  parse_status: string
  parse_message: string | null
  chunk_count: number
  token_count: number
}

export interface ListKnowledgeFilesResponse {
  knowledge_base_name: string
  files: UploadKnowledgeFileResponse[]
}

export interface FileChunkPreviewResponse {
  sequence: number
  content: string
}

export interface KnowledgeFileDetailResponse {
  knowledge_base_name: string
  biz_file_id: string
  biz_file_name: string
  parse_status: string
  parse_message: string | null
  chunk_count: number
  token_count: number
  chunks: FileChunkPreviewResponse[]
}

export interface KnowledgeFileContentResponse {
  blob: Blob
  mediaType: string
}

export interface ChatRequest {
  assistant_name: string
  question: string
  session_name?: string
}

export interface ChatReference {
  biz_file_id: string
  biz_file_name: string
  chunk_content: string
  similarity_score: number
}

export interface ChatResponse {
  answer: string
  references: ChatReference[]
}

export type IntegrationErrorKind = 'timeout' | 'network' | 'http' | 'invalid_response' | 'stream'
