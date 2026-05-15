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
  biz_chat_id?: string
  biz_session_id?: string
  session_name?: string
}

export interface ChatReference {
  biz_file_id: string
  biz_file_name: string
  chunk_content: string
  reference_number: number | null
  similarity_score: number
}

export interface ChatResponse {
  answer: string
  references: ChatReference[]
  error_code?: string | null
  error_message?: string | null
}

export interface RagflowDatasetConfig {
  biz_knowledge_base_id: string
  name: string
  embedding_model: string
  chunk_method: string
  document_count: number
  chunk_count: number
  parser_config: Record<string, unknown>
}

export interface RagflowChatConfig {
  biz_chat_id: string
  name: string
  biz_knowledge_base_ids: string[]
  kb_names: string[]
  llm_id: string
  similarity_threshold: number
  vector_similarity_weight: number
  top_k: number
  top_n: number
  rerank_id: string
  prompt_config: Record<string, unknown>
}

export interface RagflowConfigResponse {
  datasets: RagflowDatasetConfig[]
  chats: RagflowChatConfig[]
}

export interface RagflowModelOption {
  model_id: string
  label: string
  source: string
}

export interface ListRagflowModelsResponse {
  models: RagflowModelOption[]
}

export interface RagflowSessionMessage {
  role: 'user' | 'assistant'
  content: string
  references: ChatReference[]
}

export interface RagflowSession {
  biz_session_id: string
  name: string
  biz_chat_id: string
  messages: RagflowSessionMessage[]
}

export interface ListRagflowSessionsResponse {
  sessions: RagflowSession[]
}

export interface CreateRagflowSessionPayload {
  name: string
}

export interface UpdateRagflowSessionPayload {
  name: string
}

export interface DeleteRagflowSessionResponse {
  deleted: boolean
}

export interface UpdateRagflowChatConfigPayload {
  biz_chat_id: string
  biz_knowledge_base_ids: string[]
  llm_id?: string
  similarity_threshold?: number
  vector_similarity_weight?: number
  top_k?: number
  top_n?: number
  rerank_id?: string
  prompt_system?: string
  empty_response?: string
  quote?: boolean
}

export type IntegrationErrorKind = 'timeout' | 'network' | 'http' | 'invalid_response' | 'stream'
