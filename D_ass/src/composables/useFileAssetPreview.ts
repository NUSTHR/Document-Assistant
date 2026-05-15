import { onBeforeUnmount, ref, type ComputedRef } from 'vue'

import { getKnowledgeFileContent } from '../lib/integration-api'
import { toFriendlyMessage } from '../lib/workspace-errors'
import type { FileAssetPreviewMode, FileAssetPreviewState, KnowledgeFileItem } from '../types/workspace'

const TEXT_PREVIEW_BYTE_LIMIT = 200 * 1024

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex < 0) {
    return ''
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase()
}

function resolvePreviewMode(fileName: string, mediaType: string): FileAssetPreviewMode {
  const extension = getFileExtension(fileName)

  if (mediaType === 'application/pdf' || extension === 'pdf') {
    return 'pdf'
  }

  if (
    mediaType.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)
  ) {
    return 'image'
  }

  if (
    mediaType.startsWith('text/') ||
    [
      'txt',
      'md',
      'csv',
      'json',
      'log',
      'py',
      'ts',
      'tsx',
      'js',
      'jsx',
      'vue',
      'html',
      'css',
      'yml',
      'yaml',
      'xml',
    ].includes(extension)
  ) {
    return 'text'
  }

  return 'unsupported'
}

function revokeObjectUrl(objectUrl: string | null): void {
  if (!objectUrl) {
    return
  }

  URL.revokeObjectURL(objectUrl)
}

export function useFileAssetPreview(
  currentFile: ComputedRef<KnowledgeFileItem | null>,
) {
  const isLoading = ref<boolean>(false)
  const errorMessage = ref<string>('')
  const previewState = ref<FileAssetPreviewState | null>(null)
  const requestVersion = ref<number>(0)

  function clearPreview(): void {
    revokeObjectUrl(previewState.value?.objectUrl ?? null)
    previewState.value = null
  }

  async function loadAssetPreview(): Promise<void> {
    const selectedFile = currentFile.value
    if (!selectedFile) {
      clearPreview()
      errorMessage.value = ''
      return
    }

    const currentRequestVersion = requestVersion.value + 1
    requestVersion.value = currentRequestVersion
    isLoading.value = true
    errorMessage.value = ''

    try {
      const response = await getKnowledgeFileContent(
        selectedFile.knowledgeBaseName,
        selectedFile.bizFileId,
      )
      if (requestVersion.value !== currentRequestVersion) {
        return
      }

      const objectUrl = URL.createObjectURL(response.blob)
      const previewMode = resolvePreviewMode(selectedFile.bizFileName, response.mediaType)
      const textBlob = previewMode === 'text'
        ? response.blob.slice(0, TEXT_PREVIEW_BYTE_LIMIT)
        : null
      const textContent = textBlob ? await textBlob.text() : ''

      clearPreview()
      previewState.value = {
        fileName: selectedFile.bizFileName,
        helperText:
          previewMode === 'unsupported'
            ? 'This format is not suitable for direct browser preview.'
            : 'Original file preview is available in the browser.',
        mediaType: response.mediaType,
        mode: previewMode,
        objectUrl,
        textContent,
        isTextTruncated:
          previewMode === 'text' && response.blob.size > TEXT_PREVIEW_BYTE_LIMIT,
      }
    } catch (error: unknown) {
      if (requestVersion.value !== currentRequestVersion) {
        return
      }

      clearPreview()
      errorMessage.value = toFriendlyMessage(error, 'Failed to load source file.')
    } finally {
      if (requestVersion.value === currentRequestVersion) {
        isLoading.value = false
      }
    }
  }

  function resetAssetPreview(): void {
    requestVersion.value += 1
    errorMessage.value = ''
    clearPreview()
    isLoading.value = false
  }

  onBeforeUnmount(() => {
    clearPreview()
  })

  return {
    assetPreview: previewState,
    assetPreviewErrorMessage: errorMessage,
    isLoadingAssetPreview: isLoading,
    loadAssetPreview,
    resetAssetPreview,
  }
}
