import { computed, ref, watch } from 'vue'

import { getHealth } from '../lib/integration-api'
import { toFriendlyMessage } from '../lib/workspace-errors'
import {
  toAnswerSegments,
  toCurrentFileSummary,
  toKnowledgeFileCards,
  toKnowledgeWorkspaceSummary,
  toReferenceCards,
  toUploadDraftSummary,
} from '../lib/workspace-presenters'
import { useChatSession } from './useChatSession'
import { useFileAssetPreview } from './useFileAssetPreview'
import { useFileDetailPreview } from './useFileDetailPreview'
import { useKnowledgeFiles } from './useKnowledgeFiles'
import { useReferenceViewer } from './useReferenceViewer'

const EMPTY_HEALTH_STATUS = '未检测'
const HEALTH_FAILURE_STATUS = '失败'

export function useRagWorkspace() {
  const knowledgeFiles = useKnowledgeFiles()
  const chatSession = useChatSession()
  const healthStatus = ref<string>(EMPTY_HEALTH_STATUS)
  const healthErrorMessage = ref<string>('')

  const referenceCards = computed(() => {
    return toReferenceCards(chatSession.streamedReferences.value)
  })
  const answerSegments = computed(() => {
    return toAnswerSegments(chatSession.streamedAnswer.value)
  })
  const referenceViewer = useReferenceViewer(referenceCards)
  const fileAssetPreview = useFileAssetPreview(knowledgeFiles.currentFile)
  const fileDetailPreview = useFileDetailPreview(
    knowledgeFiles.currentFile,
    referenceViewer.activeReferenceCard,
  )
  const fileCards = computed(() => {
    return toKnowledgeFileCards(
      knowledgeFiles.files.value,
      knowledgeFiles.currentFileBizId.value,
      referenceViewer.activeReferenceCard.value,
      referenceCards.value,
    )
  })
  const currentFileSummary = computed(() => {
    return toCurrentFileSummary(
      knowledgeFiles.currentFile.value,
      referenceViewer.activeReferenceCard.value,
      referenceCards.value,
    )
  })
  const workspaceSummary = computed(() => {
    return toKnowledgeWorkspaceSummary(
      knowledgeFiles.files.value,
      knowledgeFiles.currentFile.value,
      referenceViewer.activeReferenceCard.value,
      referenceCards.value,
    )
  })
  const uploadDraftSummary = computed(() => {
    return toUploadDraftSummary(
      knowledgeFiles.selectedFile.value?.name ?? '',
      knowledgeFiles.canUploadFile.value,
      knowledgeFiles.isUploadingFile.value,
    )
  })
  const hasMissingActiveReferenceSource = computed<boolean>(() => {
    const activeReferenceCard = referenceViewer.activeReferenceCard.value
    if (!activeReferenceCard) {
      return false
    }

    return !knowledgeFiles.files.value.some((file) => {
      return file.bizFileId === activeReferenceCard.bizFileId
    })
  })

  watch(referenceViewer.activeReferenceCard, (activeReferenceCard) => {
    if (!activeReferenceCard) {
      return
    }

    const hasMatchingFile = knowledgeFiles.files.value.some((file) => {
      return file.bizFileId === activeReferenceCard.bizFileId
    })
    if (hasMatchingFile) {
      knowledgeFiles.selectKnowledgeFile(activeReferenceCard.bizFileId)
    }
  })

  watch(
    () => knowledgeFiles.currentFile.value?.bizFileId ?? '',
    () => {
      fileAssetPreview.resetAssetPreview()
    },
  )

  const pageErrorMessage = computed<string>(() => {
    return ''
  })

  async function checkHealth(): Promise<void> {
    healthErrorMessage.value = ''

    try {
      const response = await getHealth()
      healthStatus.value = response.status
    } catch (error: unknown) {
      healthStatus.value = HEALTH_FAILURE_STATUS
      healthErrorMessage.value = toFriendlyMessage(error, '健康检查失败。')
    }
  }

  function handleReferenceSelection(referenceNumber: number): void {
    referenceViewer.selectReference(referenceNumber)
  }

  return {
    activeReferenceCard: referenceViewer.activeReferenceCard,
    activeReferenceNumber: referenceViewer.activeReferenceNumber,
    answerSegments,
    answerStatus: chatSession.answerStatus,
    assistantName: chatSession.assistantName,
    bizFileId: knowledgeFiles.bizFileId,
    bizFileName: knowledgeFiles.bizFileName,
    canSubmitChat: chatSession.canSubmitChat,
    canUploadFile: knowledgeFiles.canUploadFile,
    cancelChat: chatSession.cancelChat,
    chatErrorMessage: chatSession.errorMessage,
    checkHealth,
    currentFile: knowledgeFiles.currentFile,
    currentFileAssetPreview: fileAssetPreview.assetPreview,
    currentFileDetail: fileDetailPreview.fileDetail,
    currentFileSummary,
    fileCards,
    files: knowledgeFiles.files,
    handleFileChange: knowledgeFiles.handleFileChange,
    handleReferenceSelection,
    hasMissingActiveReferenceSource,
    healthErrorMessage,
    healthStatus,
    isLoadingAssetPreview: fileAssetPreview.isLoadingAssetPreview,
    isLoadingFiles: knowledgeFiles.isLoadingFiles,
    isLoadingFileDetail: fileDetailPreview.isLoadingFileDetail,
    isStreamingChat: chatSession.isStreamingChat,
    isUploadingFile: knowledgeFiles.isUploadingFile,
    knowledgeBaseName: knowledgeFiles.knowledgeBaseName,
    knowledgeFilesErrorMessage: knowledgeFiles.errorMessage,
    loadFiles: knowledgeFiles.loadFiles,
    fileAssetPreviewErrorMessage: fileAssetPreview.assetPreviewErrorMessage,
    fileDetailErrorMessage: fileDetailPreview.fileDetailErrorMessage,
    pageErrorMessage,
    question: chatSession.question,
    referenceCards,
    selectedFile: knowledgeFiles.selectedFile,
    selectKnowledgeFile: knowledgeFiles.selectKnowledgeFile,
    sessionName: chatSession.sessionName,
    streamedAnswer: chatSession.streamedAnswer,
    submitChat: chatSession.submitChat,
    submitUpload: knowledgeFiles.submitUpload,
    uploadDraftSummary,
    workspaceSummary,
    reloadCurrentFileDetail: fileDetailPreview.loadFileDetail,
    loadCurrentFileAssetPreview: fileAssetPreview.loadAssetPreview,
  }
}
