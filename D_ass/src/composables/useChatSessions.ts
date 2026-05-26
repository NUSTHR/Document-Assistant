import { computed, ref, watch, type Ref } from 'vue'

import {
  deleteRagflowChatSession,
  listRagflowChatSessions,
  updateRagflowChatSession,
} from '../lib/integration-api'
import {
  createDraftSession,
  DRAFT_SESSION_ID,
  isDraftSessionId,
  upsertSessionSummary,
} from '../lib/session-list'
import { readStringArray } from '../lib/storage'
import { toFriendlyMessage } from '../lib/workspace-errors'
import type { RagflowSession } from '../types/integration'
import type { SessionDialogMode, SessionItem } from '../types/chat'

interface SessionSummaryInput {
  bizChatId: string
  bizSessionId: string
  name: string
}

interface UseChatSessionsOptions {
  onActiveSessionCleared?: () => void
  onSessionLoadError?: (message: string, chatId: string) => Promise<boolean> | boolean
  onSessionLoaded?: (session: RagflowSession) => void
  removeSessionCitationSnapshot?: (sessionId: string) => void
  resetCitationUi?: (options?: { closePanel?: boolean }) => void
  resetChat?: () => void
}

const PINNED_SESSIONS_STORAGE_KEY = 'documentation-assistant:pinned-sessions'

export function useChatSessions(
  selectedChatId: Ref<string>,
  sessionId: Ref<string>,
  sessionName: Ref<string>,
  options: UseChatSessionsOptions = {},
) {
  const isLoadingSessions = ref<boolean>(false)
  const sessions = ref<RagflowSession[]>([])
  const draftSession = ref<RagflowSession | null>(null)
  const pinnedSessionIds = ref<string[]>(readStringArray(PINNED_SESSIONS_STORAGE_KEY))
  const openSessionMenuId = ref<string>('')
  const sessionDialogMode = ref<SessionDialogMode | null>(null)
  const pendingSessionItem = ref<SessionItem | null>(null)
  const pendingSessionName = ref<string>('')
  const isSessionActionBusy = ref<boolean>(false)
  const sessionErrorMessage = ref<string>('')

  const selectedSession = computed(() => {
    if (!sessionId.value) {
      return null
    }

    if (isDraftSessionId(sessionId.value)) {
      return draftSession.value
    }

    return sessions.value.find((session) => session.biz_session_id === sessionId.value) ?? null
  })

  const sessionItems = computed<SessionItem[]>(() => {
    const persistedSessionItems = sessions.value
      .map((session) => {
        return {
          id: session.biz_session_id,
          name: session.name,
          isPinned: pinnedSessionIds.value.includes(session.biz_session_id),
          isDraft: false,
        }
      })
      .sort((left, right) => Number(right.isPinned) - Number(left.isPinned))

    if (!draftSession.value) {
      return persistedSessionItems
    }

    return [
      {
        id: draftSession.value.biz_session_id,
        name: draftSession.value.name,
        isPinned: false,
        isDraft: true,
      },
      ...persistedSessionItems,
    ]
  })

  const sessionDialogTitle = computed(() => {
    if (sessionDialogMode.value === 'delete') {
      return 'Delete Session'
    }

    return 'Rename Session'
  })

  const sessionDialogSubtitle = computed(() => {
    if (sessionDialogMode.value === 'delete') {
      return 'This removes the selected conversation from the session list.'
    }

    return 'Update the conversation label shown in Chat Sessions.'
  })

  watch(pinnedSessionIds, (ids) => {
    window.localStorage.setItem(PINNED_SESSIONS_STORAGE_KEY, JSON.stringify(ids))
  })

  async function loadSessions(
    chatId: string,
    loadOptions: { recoverUnavailableChat?: boolean } = {},
  ): Promise<void> {
    isLoadingSessions.value = true
    sessionErrorMessage.value = ''

    try {
      const response = await listRagflowChatSessions(chatId)
      sessions.value = response.sessions
      if (isDraftSessionId(sessionId.value) && draftSession.value) {
        return
      }

      const activeSession =
        response.sessions.find((session) => session.biz_session_id === sessionId.value) ??
        response.sessions[0] ??
        null
      if (activeSession) {
        sessionId.value = activeSession.biz_session_id
        sessionName.value = activeSession.name
        options.onSessionLoaded?.(activeSession)
      } else {
        clearActiveSession()
      }
    } catch (error: unknown) {
      const errorMessage = toFriendlyMessage(error, 'Failed to load RAGFlow sessions.')
      clearSessions()
      if (loadOptions.recoverUnavailableChat ?? true) {
        const recovered = await options.onSessionLoadError?.(errorMessage, chatId)
        if (recovered) {
          return
        }
      }

      sessionErrorMessage.value = errorMessage
    } finally {
      isLoadingSessions.value = false
    }
  }

  function clearSessions(): void {
    sessions.value = []
    draftSession.value = null
    clearActiveSession()
  }

  function clearActiveSession(): void {
    sessionId.value = ''
    sessionName.value = ''
    options.resetCitationUi?.({ closePanel: true })
    options.resetChat?.()
    options.onActiveSessionCleared?.()
  }

  function createNewChat(): boolean {
    options.resetChat?.()
    options.resetCitationUi?.({ closePanel: true })
    if (!selectedChatId.value) {
      sessionId.value = ''
      sessionName.value = ''
      sessionErrorMessage.value = 'Select a RAGFlow assistant before creating a chat session.'
      return false
    }

    draftSession.value = createDraftSession(selectedChatId.value)
    sessionId.value = DRAFT_SESSION_ID
    sessionName.value = draftSession.value.name
    sessionErrorMessage.value = ''
    return true
  }

  function selectSession(item: SessionItem): void {
    openSessionMenuId.value = ''
    options.resetChat?.()
    if (!item.isDraft) {
      draftSession.value = null
    }
    sessionId.value = item.id
    sessionName.value = item.name
  }

  function syncActiveSessionSummary(input: SessionSummaryInput): void {
    if (!input.bizChatId || !input.bizSessionId || isDraftSessionId(input.bizSessionId)) {
      return
    }

    sessions.value = upsertSessionSummary(sessions.value, input)
    draftSession.value = null
  }

  async function confirmSessionDialog(): Promise<void> {
    const item = pendingSessionItem.value
    if (!item || !sessionDialogMode.value) {
      closeSessionDialog()
      return
    }

    isSessionActionBusy.value = true
    try {
      if (sessionDialogMode.value === 'rename') {
        await confirmRenameSession(item)
      } else {
        await confirmDeleteSession(item)
      }
      closeSessionDialog()
    } finally {
      isSessionActionBusy.value = false
    }
  }

  async function confirmRenameSession(item: SessionItem): Promise<void> {
    const trimmedName = pendingSessionName.value.trim()
    if (!trimmedName || trimmedName === item.name || !selectedChatId.value) {
      return
    }

    try {
      const updatedSession = await updateRagflowChatSession(selectedChatId.value, item.id, {
        name: trimmedName,
      })
      sessions.value = sessions.value.map((session) => {
        return session.biz_session_id === updatedSession.biz_session_id ? updatedSession : session
      })
      if (sessionId.value === updatedSession.biz_session_id) {
        sessionName.value = updatedSession.name
      }
    } catch {
      await loadSessions(selectedChatId.value)
    }
  }

  async function confirmDeleteSession(item: SessionItem): Promise<void> {
    if (!selectedChatId.value) {
      return
    }

    try {
      const result = await deleteRagflowChatSession(selectedChatId.value, item.id)
      if (!result.deleted) {
        throw new Error('RAGFlow did not delete the session.')
      }

      pinnedSessionIds.value = pinnedSessionIds.value.filter((id) => id !== item.id)
      options.removeSessionCitationSnapshot?.(item.id)
      if (sessionId.value === item.id) {
        clearActiveSession()
      }
      await loadSessions(selectedChatId.value)
    } catch {
      await loadSessions(selectedChatId.value)
    }
  }

  function closeSessionDialog(): void {
    sessionDialogMode.value = null
    pendingSessionItem.value = null
    pendingSessionName.value = ''
  }

  function toggleSessionMenu(item: SessionItem): void {
    openSessionMenuId.value = openSessionMenuId.value === item.id ? '' : item.id
  }

  function closeSessionMenu(): void {
    openSessionMenuId.value = ''
  }

  function togglePinnedSession(item: SessionItem): void {
    openSessionMenuId.value = ''
    if (pinnedSessionIds.value.includes(item.id)) {
      pinnedSessionIds.value = pinnedSessionIds.value.filter((id) => id !== item.id)
      return
    }

    pinnedSessionIds.value = [item.id, ...pinnedSessionIds.value]
  }

  async function renameSession(item: SessionItem): Promise<void> {
    openSessionMenuId.value = ''
    pendingSessionItem.value = item
    pendingSessionName.value = item.name
    sessionDialogMode.value = 'rename'
  }

  async function removeSession(item: SessionItem): Promise<void> {
    openSessionMenuId.value = ''
    pendingSessionItem.value = item
    pendingSessionName.value = item.name
    sessionDialogMode.value = 'delete'
  }

  function resetSessions(): void {
    sessions.value = []
    draftSession.value = null
    openSessionMenuId.value = ''
    pendingSessionItem.value = null
    pendingSessionName.value = ''
    sessionDialogMode.value = null
    sessionErrorMessage.value = ''
  }

  return {
    closeSessionMenu,
    clearSessions,
    closeSessionDialog,
    confirmSessionDialog,
    createNewChat,
    draftSession,
    isLoadingSessions,
    isSessionActionBusy,
    loadSessions,
    openSessionMenuId,
    pendingSessionItem,
    pendingSessionName,
    removeSession,
    renameSession,
    resetSessions,
    selectSession,
    selectedSession,
    sessionDialogMode,
    sessionDialogSubtitle,
    sessionDialogTitle,
    sessionErrorMessage,
    sessionItems,
    sessions,
    syncActiveSessionSummary,
    togglePinnedSession,
    toggleSessionMenu,
  }
}
