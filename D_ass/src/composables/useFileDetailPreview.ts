import { computed, ref, watch, type ComputedRef } from 'vue'

import { getKnowledgeFileDetail } from '../lib/integration-api'
import { toFriendlyMessage } from '../lib/workspace-errors'
import { toFileDetailPanelState } from '../lib/workspace-presenters'
import type { KnowledgeFileDetailResponse } from '../types/integration'
import type { KnowledgeFileItem, ReferenceCard } from '../types/workspace'

export function useFileDetailPreview(
  currentFile: ComputedRef<KnowledgeFileItem | null>,
  activeReferenceCard: ComputedRef<ReferenceCard | null>,
) {
  const isLoading = ref<boolean>(false)
  const errorMessage = ref<string>('')
  const rawFileDetail = ref<KnowledgeFileDetailResponse | null>(null)
  const requestVersion = ref<number>(0)

  const fileDetail = computed(() => {
    if (!rawFileDetail.value) {
      return null
    }

    return toFileDetailPanelState(rawFileDetail.value, activeReferenceCard.value)
  })

  async function loadFileDetail(): Promise<void> {
    const selectedFile = currentFile.value
    if (!selectedFile) {
      rawFileDetail.value = null
      errorMessage.value = ''
      return
    }

    const currentRequestVersion = requestVersion.value + 1
    requestVersion.value = currentRequestVersion
    isLoading.value = true
    errorMessage.value = ''

    try {
      const detail = await getKnowledgeFileDetail(
        selectedFile.knowledgeBaseName,
        selectedFile.bizFileId,
      )
      if (requestVersion.value !== currentRequestVersion) {
        return
      }

      rawFileDetail.value = detail
    } catch (error: unknown) {
      if (requestVersion.value !== currentRequestVersion) {
        return
      }

      rawFileDetail.value = null
      errorMessage.value = toFriendlyMessage(error, 'Failed to load file details.')
    } finally {
      if (requestVersion.value === currentRequestVersion) {
        isLoading.value = false
      }
    }
  }

  watch(
    () => currentFile.value?.bizFileId ?? '',
    async () => {
      await loadFileDetail()
    },
    { immediate: true },
  )

  return {
    fileDetail,
    fileDetailErrorMessage: errorMessage,
    isLoadingFileDetail: isLoading,
    loadFileDetail,
  }
}
