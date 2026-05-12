export interface KnowledgeFileItem {
  knowledgeBaseName: string
  bizFileId: string
  bizFileName: string
  parseStatus: string
  parseMessage: string | null
  chunkCount: number
  tokenCount: number
  lastUpdatedLabel: string
}

export interface AnswerSegment {
  key: string
  kind: 'text' | 'reference'
  text: string
  referenceNumber: number | null
}

export interface ReferenceCard {
  key: string
  referenceNumber: number
  bizFileId: string
  bizFileName: string
  similarityScore: number
  similarityLabel: string
  chunkContent: string
}

export interface KnowledgeFileCard {
  key: string
  knowledgeBaseName: string
  bizFileId: string
  bizFileName: string
  parseStatus: string
  parseMessage: string | null
  chunkCount: number
  tokenCount: number
  lastUpdatedLabel: string
  isCurrent: boolean
  isReferencedInAnswer: boolean
  isActiveReferenceSource: boolean
  referenceCount: number
  relationLabel: string
  statsLabel: string
}

export interface KnowledgeWorkspaceSummary {
  totalFiles: number
  referencedFiles: number
  currentFileLabel: string
  activeReferenceLabel: string
  helperText: string
}

export interface CurrentFileSummary {
  title: string
  bizFileId: string
  knowledgeBaseName: string
  parseStatus: string
  parseMessage: string | null
  statsLabel: string
  relationLabel: string
  lastUpdatedLabel: string
}

export interface UploadDraftSummary {
  selectedFileName: string
  helperText: string
  readinessLabel: string
}

export interface FileChunkPreviewCard {
  key: string
  sequence: number
  content: string
  previewLabel: string
  isMatchedToActiveReference: boolean
}

export interface FileDetailPanelState {
  title: string
  bizFileId: string
  knowledgeBaseName: string
  parseStatus: string
  parseMessage: string | null
  statsLabel: string
  helperText: string
  chunks: FileChunkPreviewCard[]
}

export type FileAssetPreviewMode = 'pdf' | 'image' | 'text' | 'unsupported'

export interface FileAssetPreviewState {
  fileName: string
  helperText: string
  mediaType: string
  mode: FileAssetPreviewMode
  objectUrl: string | null
  textContent: string
  isTextTruncated: boolean
}
