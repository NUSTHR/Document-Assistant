import type {
  ChatReference,
  KnowledgeFileDetailResponse,
  UploadKnowledgeFileResponse,
} from '../types/integration'
import type {
  AnswerSegment,
  CurrentFileSummary,
  FileDetailPanelState,
  KnowledgeFileCard,
  KnowledgeFileItem,
  KnowledgeWorkspaceSummary,
  ReferenceCard,
  UploadDraftSummary,
} from '../types/workspace'

const FOOTNOTE_PATTERN = /\[\^(\d+)\]/g

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function createTimeLabel(): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

export function toKnowledgeFileItem(
  response: UploadKnowledgeFileResponse,
  knowledgeBaseName: string,
): KnowledgeFileItem {
  return {
    knowledgeBaseName,
    bizFileId: response.biz_file_id,
    bizFileName: response.biz_file_name,
    parseStatus: response.parse_status,
    parseMessage: response.parse_message,
    chunkCount: response.chunk_count,
    tokenCount: response.token_count,
    lastUpdatedLabel: createTimeLabel(),
  }
}

export function upsertKnowledgeFile(
  files: KnowledgeFileItem[],
  nextFile: KnowledgeFileItem,
): KnowledgeFileItem[] {
  const remainingFiles = files.filter((file) => file.bizFileId !== nextFile.bizFileId)
  return [nextFile, ...remainingFiles]
}

export function toReferenceCards(references: ChatReference[]): ReferenceCard[] {
  return references.map((reference, index) => {
    return {
      key: `${reference.biz_file_id}-${index}-${reference.chunk_content}`,
      referenceNumber: reference.reference_number ?? index,
      bizFileId: reference.biz_file_id,
      bizFileName: reference.biz_file_name,
      similarityScore: reference.similarity_score,
      similarityLabel: reference.similarity_score.toFixed(2),
      chunkContent: reference.chunk_content,
    }
  })
}

function buildReferenceCountMap(referenceCards: ReferenceCard[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const referenceCard of referenceCards) {
    counts.set(
      referenceCard.bizFileId,
      (counts.get(referenceCard.bizFileId) ?? 0) + 1,
    )
  }

  return counts
}

export function toKnowledgeFileCards(
  files: KnowledgeFileItem[],
  currentFileBizId: string | null,
  activeReferenceCard: ReferenceCard | null,
  referenceCards: ReferenceCard[],
): KnowledgeFileCard[] {
  const referenceCounts = buildReferenceCountMap(referenceCards)

  return files.map((file) => {
    const referenceCount = referenceCounts.get(file.bizFileId) ?? 0
    const isCurrent = file.bizFileId === currentFileBizId
    const isActiveReferenceSource =
      activeReferenceCard?.bizFileId === file.bizFileId
    const isReferencedInAnswer = referenceCount > 0

    let relationLabel = 'Not cited by the current answer'
    if (isActiveReferenceSource) {
      relationLabel = `Active citation source [^${activeReferenceCard?.referenceNumber ?? ''}]`
    } else if (isCurrent && isReferencedInAnswer) {
      relationLabel = `Current file, cited ${referenceCount} times`
    } else if (isCurrent) {
      relationLabel = 'Current file'
    } else if (isReferencedInAnswer) {
      relationLabel = `Cited ${referenceCount} times by the current answer`
    }

    return {
      key: `${file.bizFileId}-${file.lastUpdatedLabel}`,
      knowledgeBaseName: file.knowledgeBaseName,
      bizFileId: file.bizFileId,
      bizFileName: file.bizFileName,
      parseStatus: file.parseStatus,
      parseMessage: file.parseMessage,
      chunkCount: file.chunkCount,
      tokenCount: file.tokenCount,
      lastUpdatedLabel: file.lastUpdatedLabel,
      isCurrent,
      isReferencedInAnswer,
      isActiveReferenceSource,
      referenceCount,
      relationLabel,
      statsLabel: `chunks=${file.chunkCount} | tokens=${file.tokenCount} | ${file.lastUpdatedLabel}`,
    }
  })
}

export function toKnowledgeWorkspaceSummary(
  files: KnowledgeFileItem[],
  currentFile: KnowledgeFileItem | null,
  activeReferenceCard: ReferenceCard | null,
  referenceCards: ReferenceCard[],
): KnowledgeWorkspaceSummary {
  const referencedFiles = new Set(referenceCards.map((card) => card.bizFileId)).size
  const currentFileLabel = currentFile
    ? `${currentFile.bizFileName} | ${currentFile.parseStatus}`
    : 'No file selected'
  const activeReferenceLabel = activeReferenceCard
    ? `[^${activeReferenceCard.referenceNumber}] ${activeReferenceCard.bizFileName}`
    : 'No active citation'

  return {
    totalFiles: files.length,
    referencedFiles,
    currentFileLabel,
    activeReferenceLabel,
    helperText:
      files.length === 0
        ? 'Uploaded files will appear here and stay linked to citations.'
        : 'Current file, active answer citations, and preview stay in sync.',
  }
}

export function toCurrentFileSummary(
  currentFile: KnowledgeFileItem | null,
  activeReferenceCard: ReferenceCard | null,
  referenceCards: ReferenceCard[],
): CurrentFileSummary | null {
  if (!currentFile) {
    return null
  }

  const referenceCount = referenceCards.filter((referenceCard) => {
    return referenceCard.bizFileId === currentFile.bizFileId
  }).length
  const isActiveReferenceSource =
    activeReferenceCard?.bizFileId === currentFile.bizFileId

  let relationLabel = 'Current answer has not cited this file'
  if (isActiveReferenceSource) {
    relationLabel = `Active citation comes from this file [^${activeReferenceCard?.referenceNumber ?? ''}]`
  } else if (referenceCount > 0) {
    relationLabel = `Current answer cited this file ${referenceCount} times`
  }

  return {
    title: currentFile.bizFileName,
    bizFileId: currentFile.bizFileId,
    knowledgeBaseName: currentFile.knowledgeBaseName,
    parseStatus: currentFile.parseStatus,
    parseMessage: currentFile.parseMessage,
    statsLabel: `chunks=${currentFile.chunkCount} | tokens=${currentFile.tokenCount}`,
    relationLabel,
    lastUpdatedLabel: currentFile.lastUpdatedLabel,
  }
}

export function toUploadDraftSummary(
  selectedFileName: string,
  canUpload: boolean,
  isUploading: boolean,
): UploadDraftSummary {
  if (isUploading) {
    return {
      selectedFileName: selectedFileName || 'Uploading',
      helperText: 'File is being sent to the integration layer.',
      readinessLabel: 'Uploading',
    }
  }

  if (!selectedFileName) {
    return {
      selectedFileName: 'No file selected',
      helperText: 'Fill in the knowledge base, business file ID, and file name before selecting a file.',
      readinessLabel: 'Pending',
    }
  }

  return {
    selectedFileName,
    helperText: canUpload
      ? 'Upload requirements are satisfied.'
      : 'A file is selected, but upload details are incomplete.',
    readinessLabel: canUpload ? 'Ready' : 'Incomplete',
  }
}

export function toFileDetailPanelState(
  detail: KnowledgeFileDetailResponse,
  activeReferenceCard: ReferenceCard | null,
): FileDetailPanelState {
  const normalizedReferenceContent = activeReferenceCard
    ? normalizeForMatch(activeReferenceCard.chunkContent)
    : ''

  return {
    title: detail.biz_file_name,
    bizFileId: detail.biz_file_id,
    knowledgeBaseName: detail.knowledge_base_name,
    parseStatus: detail.parse_status,
    parseMessage: detail.parse_message,
    statsLabel: `chunks=${detail.chunk_count} | tokens=${detail.token_count}`,
    helperText:
      detail.chunks.length > 0
        ? 'Chunk preview for the current file.'
        : detail.parse_message
          ? 'No chunk preview is available. Review the parse failure details.'
          : 'No chunk preview is available yet.',
    chunks: detail.chunks.map((chunk) => {
      const normalizedChunkContent = normalizeForMatch(chunk.content)
      const isMatchedToActiveReference =
        normalizedReferenceContent.length > 0 &&
        (normalizedChunkContent.includes(normalizedReferenceContent) ||
          normalizedReferenceContent.includes(normalizedChunkContent))

      return {
        key: `${detail.biz_file_id}-${chunk.sequence}`,
        sequence: chunk.sequence,
        content: chunk.content,
        previewLabel: `Chunk ${chunk.sequence}`,
        isMatchedToActiveReference,
      }
    }),
  }
}

export function toAnswerSegments(answer: string): AnswerSegment[] {
  if (!answer) {
    return []
  }

  const segments: AnswerSegment[] = []
  let match: RegExpExecArray | null
  let lastIndex = 0

  while ((match = FOOTNOTE_PATTERN.exec(answer)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        key: `text-${lastIndex}`,
        kind: 'text',
        text: answer.slice(lastIndex, match.index),
        referenceNumber: null,
      })
    }

    const referenceNumber = Number(match[1])
    segments.push({
      key: `reference-${match.index}-${referenceNumber}`,
      kind: 'reference',
      text: match[0],
      referenceNumber: Number.isFinite(referenceNumber) ? referenceNumber : null,
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < answer.length) {
    segments.push({
      key: `text-${lastIndex}`,
      kind: 'text',
      text: answer.slice(lastIndex),
      referenceNumber: null,
    })
  }

  return segments
}
