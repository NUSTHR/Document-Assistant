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
  return new Intl.DateTimeFormat('zh-CN', {
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
      referenceNumber: index + 1,
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

    let relationLabel = '未被当前回答引用'
    if (isActiveReferenceSource) {
      relationLabel = `当前激活引用来源 [^${activeReferenceCard?.referenceNumber ?? ''}]`
    } else if (isCurrent && isReferencedInAnswer) {
      relationLabel = `当前文件，已被引用 ${referenceCount} 次`
    } else if (isCurrent) {
      relationLabel = '当前文件'
    } else if (isReferencedInAnswer) {
      relationLabel = `已被当前回答引用 ${referenceCount} 次`
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
      statsLabel: `chunks=${file.chunkCount} · tokens=${file.tokenCount} · ${file.lastUpdatedLabel}`,
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
    ? `${currentFile.bizFileName} · ${currentFile.parseStatus}`
    : '未选择文件'
  const activeReferenceLabel = activeReferenceCard
    ? `[^${activeReferenceCard.referenceNumber}] ${activeReferenceCard.bizFileName}`
    : '当前无激活引用'

  return {
    totalFiles: files.length,
    referencedFiles,
    currentFileLabel,
    activeReferenceLabel,
    helperText:
      files.length === 0
        ? '上传成功后的文件会进入工作区列表，并与引用区保持联动。'
        : '当前文件、当前回答引用和右侧核对区会保持同步。',
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

  let relationLabel = '当前回答尚未引用该文件'
  if (isActiveReferenceSource) {
    relationLabel = `当前激活引用来自该文件 [^${activeReferenceCard?.referenceNumber ?? ''}]`
  } else if (referenceCount > 0) {
    relationLabel = `当前回答已引用该文件 ${referenceCount} 次`
  }

  return {
    title: currentFile.bizFileName,
    bizFileId: currentFile.bizFileId,
    knowledgeBaseName: currentFile.knowledgeBaseName,
    parseStatus: currentFile.parseStatus,
    parseMessage: currentFile.parseMessage,
    statsLabel: `chunks=${currentFile.chunkCount} · tokens=${currentFile.tokenCount}`,
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
      selectedFileName: selectedFileName || '正在上传',
      helperText: '文件已提交到防腐层，正在等待上传与解析结果。',
      readinessLabel: '上传中',
    }
  }

  if (!selectedFileName) {
    return {
      selectedFileName: '未选择文件',
      helperText: '先填写知识库、业务文件 ID、业务文件名，再选择文件。',
      readinessLabel: '待准备',
    }
  }

  return {
    selectedFileName,
    helperText: canUpload
      ? '上传条件已满足，可以将文件送入当前工作区。'
      : '文件已选择，但上传信息还不完整。',
    readinessLabel: canUpload ? '可上传' : '待补全',
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
    statsLabel: `chunks=${detail.chunk_count} · tokens=${detail.token_count}`,
    helperText:
      detail.chunks.length > 0
        ? '以下为当前文件的 chunk 预览，可结合右侧激活引用进行人工核对。'
        : detail.parse_message
          ? '当前文件尚未返回可展示的 chunk 预览，请先处理下方解析失败信息。'
          : '当前文件尚未返回可展示的 chunk 预览。',
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
