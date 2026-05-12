import { computed, ref } from 'vue'

import {
  listKnowledgeFiles,
  uploadKnowledgeFile,
} from '../lib/integration-api'
import { toFriendlyMessage } from '../lib/workspace-errors'
import {
  toKnowledgeFileItem,
  upsertKnowledgeFile,
} from '../lib/workspace-presenters'
import type { KnowledgeFileItem } from '../types/workspace'

export function useKnowledgeFiles() {
  const knowledgeBaseName = ref<string>('')
  const bizFileId = ref<string>('')
  const bizFileName = ref<string>('')
  const selectedFile = ref<File | null>(null)
  const isUploadingFile = ref<boolean>(false)
  const isLoadingFiles = ref<boolean>(false)
  const errorMessage = ref<string>('')
  const files = ref<KnowledgeFileItem[]>([])
  const currentFileBizId = ref<string | null>(null)

  const canUploadFile = computed<boolean>(() => {
    return (
      knowledgeBaseName.value.trim().length > 0 &&
      bizFileId.value.trim().length > 0 &&
      bizFileName.value.trim().length > 0 &&
      selectedFile.value !== null &&
      !isUploadingFile.value
    )
  })

  const currentFile = computed<KnowledgeFileItem | null>(() => {
    if (!currentFileBizId.value) {
      return files.value[0] ?? null
    }

    return (
      files.value.find((file) => file.bizFileId === currentFileBizId.value) ?? null
    )
  })

  function clearError(): void {
    errorMessage.value = ''
  }

  function handleFileChange(event: Event): void {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) {
      return
    }

    selectedFile.value = target.files?.[0] ?? null
    if (selectedFile.value && !bizFileName.value.trim()) {
      bizFileName.value = selectedFile.value.name
    }
  }

  function selectKnowledgeFile(nextBizFileId: string): void {
    currentFileBizId.value = nextBizFileId
  }

  async function loadFiles(): Promise<void> {
    const trimmedKnowledgeBaseName = knowledgeBaseName.value.trim()
    if (!trimmedKnowledgeBaseName) {
      errorMessage.value = '请先填写知识库名称。'
      return
    }

    clearError()
    isLoadingFiles.value = true

    try {
      const response = await listKnowledgeFiles(trimmedKnowledgeBaseName)
      files.value = response.files.map((file) => {
        return toKnowledgeFileItem(file, response.knowledge_base_name)
      })

      const hasCurrentFile = files.value.some((file) => {
        return file.bizFileId === currentFileBizId.value
      })
      if (!hasCurrentFile) {
        currentFileBizId.value = files.value[0]?.bizFileId ?? null
      }
    } catch (error: unknown) {
      errorMessage.value = toFriendlyMessage(error, '文件列表加载失败。')
    } finally {
      isLoadingFiles.value = false
    }
  }

  async function submitUpload(): Promise<void> {
    if (!canUploadFile.value || selectedFile.value === null) {
      errorMessage.value = '请先完整填写上传信息。'
      return
    }

    clearError()
    isUploadingFile.value = true
    let shouldRefreshFiles = false

    try {
      const response = await uploadKnowledgeFile({
        knowledge_base_name: knowledgeBaseName.value.trim(),
        biz_file_id: bizFileId.value.trim(),
        biz_file_name: bizFileName.value.trim(),
        file: selectedFile.value,
      })
      const nextFile = toKnowledgeFileItem(
        response,
        knowledgeBaseName.value.trim(),
      )
      files.value = upsertKnowledgeFile(files.value, nextFile)
      currentFileBizId.value = nextFile.bizFileId
      shouldRefreshFiles = true
    } catch (error: unknown) {
      errorMessage.value = toFriendlyMessage(error, '文件上传失败。')
    } finally {
      isUploadingFile.value = false
    }

    if (shouldRefreshFiles) {
      await loadFiles()
    }
  }

  return {
    bizFileId,
    bizFileName,
    canUploadFile,
    clearError,
    currentFile,
    currentFileBizId,
    errorMessage,
    files,
    handleFileChange,
    isLoadingFiles,
    isUploadingFile,
    knowledgeBaseName,
    loadFiles,
    selectKnowledgeFile,
    selectedFile,
    submitUpload,
  }
}
