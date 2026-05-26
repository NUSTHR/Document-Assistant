<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import AppSidebar from './components/AppSidebar.vue'
import AuthPanel from './components/AuthPanel.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import KnowledgeDialog from './components/KnowledgeDialog.vue'
import MobileNavigation from './components/MobileNavigation.vue'
import MobileTopBar from './components/MobileTopBar.vue'
import SessionDialog from './components/SessionDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import SourceModal from './components/SourceModal.vue'
import { useRagWorkspace } from './composables/useRagWorkspace'
import { useRagflowConfiguration, type ModelOption } from './composables/useRagflowConfiguration'
import { useSessionCitationSnapshots } from './composables/useSessionCitationSnapshots'
import { useSourceReferences } from './composables/useSourceReferences'
import {
  deleteRagflowChatSession,
  getAuthConfig,
  getAuthUser,
  getRagflowConfig,
  listRagflowChatSessions,
  loginWithRagflow,
  logoutFromRagflow,
  registerWithRagflow,
  updateRagflowChatSession,
} from './lib/integration-api'
import {
  clearAuthorization,
  readAuthUser,
  readAuthorization,
} from './lib/auth-state'
import {
  createEmptyAssistantTuningDraft,
  toAssistantTuningDraft,
} from './lib/assistant-config'
import { toFriendlyMessage } from './lib/workspace-errors'
import { toAnswerSegments } from './lib/workspace-presenters'
import {
  extractCitedReferenceNumbers,
  resolveReferenceNumbers,
} from './lib/citation-sources'
import {
  resolveActiveCitationMessageId,
} from './lib/citation-state'
import {
  createDraftSession,
  DRAFT_SESSION_ID,
  isDraftSessionId,
  upsertSessionSummary,
} from './lib/session-list'
import type {
  ChatReference,
  AuthConfigResponse,
  AssistantTuningDraft,
  AuthUser,
  RagflowSession,
  UpdateRagflowChatConfigDraftPayload,
} from './types/integration'
import type { AnswerSegment } from './types/workspace'

interface SessionItem {
  id: string
  name: string
  isPinned: boolean
  isDraft: boolean
}

interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  answerContent: string
  thoughtContent: string
  hasThought: boolean
  references: ChatReference[]
  referenceNumbers: number[]
  citedReferenceNumbers: number[]
  answerSegments: AnswerSegment[]
}

type SessionDialogMode = 'rename' | 'delete'
type AuthMode = 'login' | 'register'

interface AnswerPresentation {
  answer: string
  thought: string
  hasThought: boolean
}

const PROFILE_IMAGE_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDbV0EIMb7_6jlpqgIBumGrr4GpUZE_0i0TppiJtIlLBwFrjo0u4wZbHFbJ_l3rvQuplzUJrjKfzp8Kb1FHpN4PfzAGspFlJSpsMIfYkez0HKBF-gDKLpZ-ppeBKaMJLWLLx_FGh52AHmlO4dpd1CXeshfz5fL2kWbvd8DmN43MRd3n43iy24RRc8MdOlUsQRi2MBMyO6Edf5YBtQ2FRmUBGy7hBpRVIfOA1IbQQM7jTNTgq-iD9Ny8I1VdSoeh4GExy8w8uT_9_Jh2'

const PINNED_SESSIONS_STORAGE_KEY = 'documentation-assistant:pinned-sessions'

const {
  assistantChatId,
  assistantName,
  canSubmitChat,
  cancelChat,
  chatErrorCode,
  chatErrorMessage,
  checkHealth,
  clearTransientAnswer,
  handleReferenceSelection,
  healthStatus,
  isStreamingChat,
  knowledgeBaseName,
  question,
  referenceCards,
  resetChat,
  sessionId,
  sessionName,
  streamedAnswer,
  submittedQuestion,
  submitChat,
} = useRagWorkspace()
const {
  readLatestSnapshot: readLatestSessionCitationSnapshot,
  readSnapshot: readSessionCitationSnapshot,
  removeSnapshot: removeSessionCitationSnapshot,
  writeSnapshot: writeSessionCitationSnapshot,
} = useSessionCitationSnapshots()

const modelOpen = ref<boolean>(false)
const openSessionMenuId = ref<string>('')
const isKnowledgeOpen = ref<boolean>(false)
const isSettingsOpen = ref<boolean>(false)
const isLoadingSessions = ref<boolean>(false)
const isApplyingConfigSelection = ref<boolean>(false)
const isRecoveringChatSelection = ref<boolean>(false)
const sessions = ref<RagflowSession[]>([])
const draftSession = ref<RagflowSession | null>(null)
const pinnedSessionIds = ref<string[]>(readStringArray(PINNED_SESSIONS_STORAGE_KEY))
const chatScrollElement = ref<HTMLElement | null>(null)
const openThoughtIds = ref<string[]>([])
const flashedActionKey = ref<string>('')
const sessionDialogMode = ref<SessionDialogMode | null>(null)
const pendingSessionItem = ref<SessionItem | null>(null)
const pendingSessionName = ref<string>('')
const isSessionActionBusy = ref<boolean>(false)
const isAuthenticated = ref<boolean>(readAuthorization().trim().length > 0)
const authUser = ref<AuthUser | null>(readAuthUser())
const authMode = ref<AuthMode>('login')
const authEmail = ref<string>('')
const authPassword = ref<string>('')
const authNickname = ref<string>('')
const authErrorMessage = ref<string>('')
const isAuthBusy = ref<boolean>(false)
const authConfig = ref<AuthConfigResponse>({
  register_enabled: true,
  disable_password_login: false,
})
const assistantTuningDraft = ref<AssistantTuningDraft>(createEmptyAssistantTuningDraft())

const {
  applyConfig,
  chats,
  configErrorMessage,
  configLlmId,
  datasets,
  fetchConfig,
  hasAvailableChat,
  isLoadingConfig,
  isSavingConfig,
  loadModels,
  modelOptions,
  resetConfigState,
  saveAssistantConfig: persistAssistantConfig,
  saveKnowledgeConfig: persistKnowledgeConfig,
  saveModelConfig: persistModelConfig,
  selectedChat,
  selectedChatId,
  selectedDatasetIds,
  toggleDataset,
} = useRagflowConfiguration()

const profileName = computed(() => {
  return authUser.value?.nickname || authUser.value?.email || 'RAGFlow User'
})

const profileSubtitle = computed(() => {
  return authUser.value?.email || healthStatus.value
})

const authTitle = computed(() => {
  return authMode.value === 'login' ? 'Sign in' : 'Create account'
})

const authSubmitLabel = computed(() => {
  if (isAuthBusy.value) {
    return authMode.value === 'login' ? 'Signing in...' : 'Creating...'
  }
  return authMode.value === 'login' ? 'Sign in' : 'Register'
})

const canSubmitAuth = computed(() => {
  const hasRequiredFields =
    authEmail.value.trim().length > 0 &&
    authPassword.value.length > 0 &&
    (
      authMode.value === 'login' ||
      authNickname.value.trim().length > 0
    )
  return hasRequiredFields && !isAuthBusy.value && !authConfig.value.disable_password_login
})

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

const transcriptMessages = computed<TranscriptMessage[]>(() => {
  const rawMessages = selectedSession.value?.messages ?? []
  return rawMessages.flatMap((message, index) => {
    const role = String(message.role ?? '')
    const content = String(message.content ?? '').trim()
    if ((role !== 'user' && role !== 'assistant') || !content) {
      return []
    }
    const presentation = splitThoughtContent(content)
    const answerSegments = toAnswerSegments(presentation.answer)
    const citedReferenceNumbers = extractCitedReferenceNumbers(answerSegments)
    const references = message.references ?? []

    return [
      {
        id: `${selectedSession.value?.biz_session_id ?? 'session'}-${index}`,
        role,
        content,
        answerContent: presentation.answer,
        thoughtContent: presentation.thought,
        hasThought: presentation.hasThought,
        references,
        referenceNumbers: resolveReferenceNumbers(answerSegments, references.length),
        citedReferenceNumbers,
        answerSegments,
      },
    ]
  })
})

const liveAnswerPresentation = computed<AnswerPresentation>(() => {
  return splitThoughtContent(streamedAnswer.value)
})

const liveAnswerSegments = computed(() => {
  return toAnswerSegments(liveAnswerPresentation.value.answer)
})

const isLiveThinkingOnly = computed(() => {
  return (
    isStreamingChat.value &&
    liveAnswerPresentation.value.hasThought &&
    liveAnswerPresentation.value.answer.length === 0
  )
})

const liveAnswerIsStreaming = computed(() => {
  return (
    isStreamingChat.value &&
    shouldShowAnswer.value &&
    !chatErrorMessage.value &&
    !answerIsError.value
  )
})

const displayedTranscriptMessages = computed<TranscriptMessage[]>(() => {
  const duplicateIds = new Set<string>()
  const liveAnswer = chatErrorMessage.value || streamedAnswer.value
  let matchedQuestion = false
  let matchedAnswer = false

  for (let index = transcriptMessages.value.length - 1; index >= 0; index -= 1) {
    const message = transcriptMessages.value[index]
    if (!message) {
      continue
    }
    if (
      !matchedQuestion &&
      submittedQuestion.value &&
      message.role === 'user' &&
      contentsAreEquivalent(message.content, submittedQuestion.value)
    ) {
      duplicateIds.add(message.id)
      matchedQuestion = true
      continue
    }

    if (
      !matchedAnswer &&
      liveAnswer &&
      message.role === 'assistant' &&
      contentsAreEquivalent(message.content, liveAnswer)
    ) {
      duplicateIds.add(message.id)
      matchedAnswer = true
    }
  }

  return transcriptMessages.value.filter((message) => !duplicateIds.has(message.id))
})

const {
  activeCitationMessageId,
  activeSourceModal,
  activeSourceModalPreview,
  activeSourceReferenceNumber,
  citationsOpen,
  closeSourceModal,
  liveSourceItems,
  openSourceReference,
  resetCitationUi,
  selectSource,
  setSourceCardElement,
  setSourceScrollElement,
  sourceCountLabel,
  sourceElementKey,
  sourceItems,
  storeSessionCitationSnapshot,
} = useSourceReferences({
  handleReferenceSelection,
  isStreamingChat,
  liveAnswerSegments,
  messages: transcriptMessages,
  readLatestSnapshot: readLatestSessionCitationSnapshot,
  readSnapshot: readSessionCitationSnapshot,
  referenceCards,
  sessionId,
  streamedAnswer,
  submittedQuestion,
  writeSnapshot: writeSessionCitationSnapshot,
})
const answerIsError = computed(() => {
  return streamedAnswer.value.startsWith('ERROR:')
})

const shouldShowAnswer = computed(() => {
  return streamedAnswer.value.length > 0
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

const chatAvailabilityMessage = computed(() => {
  if (isLoadingConfig.value) {
    return ''
  }

  if (chats.value.length === 0) {
    return 'No RAGFlow chat assistant is available. Create one in RAGFlow, then refresh config.'
  }

  if (!selectedChat.value) {
    return 'The selected RAGFlow assistant is no longer available. Refresh config or choose another assistant.'
  }

  return ''
})

const chatTitle = computed(() => {
  return selectedChat.value?.name || 'Strategic Procurement Analysis'
})

const chatSubtitle = computed(() => {
  const datasetNames = datasets.value
    .filter((dataset) => selectedDatasetIds.value.includes(dataset.biz_knowledge_base_id))
    .map((dataset) => dataset.name)
  if (datasetNames.length > 0) {
    return datasetNames.join(' & ')
  }

  return 'Market Intelligence & Policy Alignment'
})

const chatInputPlaceholder = computed(() => {
  return chatAvailabilityMessage.value || 'Ask follow-up questions about market research...'
})

watch(selectedChat, (chat) => {
  if (!chat) {
    assistantChatId.value = ''
    assistantName.value = ''
    selectedDatasetIds.value = []
    draftSession.value = null
    return
  }

  assistantChatId.value = chat.biz_chat_id
  assistantName.value = chat.name
  selectedDatasetIds.value = [...chat.biz_knowledge_base_ids]
  configLlmId.value = chat.llm_id
  assistantTuningDraft.value = toAssistantTuningDraft(chat)
  draftSession.value = null
})

watch(selectedChatId, async (nextChatId, previousChatId) => {
  if (
    !nextChatId ||
    nextChatId === previousChatId ||
    isLoadingConfig.value ||
    isApplyingConfigSelection.value ||
    isRecoveringChatSelection.value
  ) {
    return
  }

  sessions.value = []
  draftSession.value = null
  sessionId.value = ''
  sessionName.value = ''
  resetCitationUi({ closePanel: true })
  resetChat()
  await loadSessions(nextChatId)
})

watch(pinnedSessionIds, (ids) => {
  window.localStorage.setItem(PINNED_SESSIONS_STORAGE_KEY, JSON.stringify(ids))
})

watch(
  sessionId,
  (nextSessionId, previousSessionId) => {
    if (nextSessionId === previousSessionId) {
      return
    }

    resetCitationUi({ closePanel: true })
  },
  { flush: 'sync' },
)

watch([sessionId, sessionName], () => {
  if (draftSession.value && sessionId.value && !isDraftSessionId(sessionId.value)) {
    syncActiveSessionSummary()
  }
})

watch(
  [displayedTranscriptMessages, submittedQuestion, streamedAnswer, isStreamingChat],
  () => {
    void scrollChatToBottom()
  },
  { deep: true },
)

onMounted(() => {
  void initializeAuth()
})

async function initializeAuth(): Promise<void> {
  await loadAuthConfig()
  if (!readAuthorization().trim()) {
    isAuthenticated.value = false
    return
  }

  try {
    authUser.value = await getAuthUser()
    isAuthenticated.value = true
    await loadConfig()
  } catch (error: unknown) {
    clearAuthorization()
    isAuthenticated.value = false
    authUser.value = null
    authErrorMessage.value = toFriendlyMessage(error, 'Please sign in again.')
  }
}

async function loadAuthConfig(): Promise<void> {
  try {
    authConfig.value = await getAuthConfig()
    if (!authConfig.value.register_enabled && authMode.value === 'register') {
      authMode.value = 'login'
    }
  } catch {
    authConfig.value = {
      register_enabled: true,
      disable_password_login: false,
    }
  }
}

function switchAuthMode(nextMode: AuthMode): void {
  authMode.value = nextMode
  authErrorMessage.value = ''
}

async function submitAuth(): Promise<void> {
  if (!canSubmitAuth.value) {
    return
  }

  authErrorMessage.value = ''
  isAuthBusy.value = true

  try {
    const session = authMode.value === 'login'
      ? await loginWithRagflow({
        email: authEmail.value.trim(),
        password: authPassword.value,
      })
      : await registerWithRagflow({
        email: authEmail.value.trim(),
        nickname: authNickname.value.trim(),
        password: authPassword.value,
      })
    authUser.value = session.user
    isAuthenticated.value = true
    authPassword.value = ''
    resetWorkspaceForAuthChange()
    await loadConfig()
    void checkHealth()
  } catch (error: unknown) {
    authErrorMessage.value = toFriendlyMessage(error, 'Authentication failed.')
  } finally {
    isAuthBusy.value = false
  }
}

async function signOut(): Promise<void> {
  try {
    await logoutFromRagflow()
  } catch {
    // Local sign-out should still clear the browser session if RAGFlow is unreachable.
  }
  clearAuthorization()
  isAuthenticated.value = false
  authUser.value = null
  authPassword.value = ''
  resetWorkspaceForAuthChange()
}

function resetWorkspaceForAuthChange(): void {
  isKnowledgeOpen.value = false
  isSettingsOpen.value = false
  citationsOpen.value = false
  sessions.value = []
  resetConfigState()
  clearUnavailableChatState()
}

async function loadConfig(): Promise<void> {
  if (!isAuthenticated.value) {
    configErrorMessage.value = 'Please sign in to load RAGFlow config.'
    return
  }

  const config = await fetchConfig()
  if (!config) {
    return
  }

  const currentChat =
    config.chats.find((chat) => chat.biz_chat_id === selectedChatId.value) ??
    config.chats.find((chat) => chat.name === assistantName.value) ??
    config.chats[0] ??
    null
  if (currentChat) {
    await applyChatSelection(currentChat.biz_chat_id, currentChat.name)
  } else {
    selectedChatId.value = ''
    clearUnavailableChatState()
    configErrorMessage.value =
      'No RAGFlow chat assistant is available. Create one in RAGFlow, then refresh config.'
  }
}

async function loadSessions(
  chatId: string,
  options: { recoverUnavailableChat?: boolean } = {},
): Promise<void> {
  isLoadingSessions.value = true
  configErrorMessage.value = ''

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
      activeCitationMessageId.value = resolveActiveCitationMessageId(
        activeSession,
        activeCitationMessageId.value,
      )
    } else {
      sessionId.value = ''
      sessionName.value = ''
      resetChat()
    }
  } catch (error: unknown) {
    const errorMessage = toFriendlyMessage(error, 'Failed to load RAGFlow sessions.')
    sessions.value = []
    draftSession.value = null
    sessionId.value = ''
    sessionName.value = ''
    resetCitationUi({ closePanel: true })
    resetChat()
    if (
      (options.recoverUnavailableChat ?? true) &&
      chatId === selectedChatId.value &&
      isUnavailableChatError(errorMessage)
    ) {
      await recoverUnavailableChatSelection(errorMessage)
      return
    }

    configErrorMessage.value = errorMessage
  } finally {
    isLoadingSessions.value = false
  }
}

async function recoverUnavailableChatSelection(fallbackMessage: string): Promise<void> {
  isRecoveringChatSelection.value = true
  try {
    const config = await getRagflowConfig()
    applyConfig(config)
    await loadModels()

    const replacementChat = config.chats[0] ?? null
    if (!replacementChat) {
      selectedChatId.value = ''
      clearUnavailableChatState()
      configErrorMessage.value =
        'The selected RAGFlow assistant was removed. Create one in RAGFlow, then refresh config.'
      return
    }

    await applyChatSelection(replacementChat.biz_chat_id, replacementChat.name, {
      recoverUnavailableChat: false,
    })
  } catch {
    selectedChatId.value = ''
    clearUnavailableChatState()
    configErrorMessage.value = fallbackMessage
  } finally {
    isRecoveringChatSelection.value = false
  }
}

function isUnavailableChatError(message: string, code = ''): boolean {
  if (code === 'RAGFLOW_CHAT_UNAVAILABLE') {
    return true
  }

  const normalizedMessage = message.toLowerCase()
  return (
    normalizedMessage.includes('chat resource was not found') ||
    (
      normalizedMessage.includes('chat assistant') &&
      normalizedMessage.includes('no longer available')
    ) ||
    normalizedMessage.includes('no ragflow chat assistant is available')
  )
}

function clearUnavailableChatState(): void {
  assistantChatId.value = ''
  assistantName.value = ''
  sessions.value = []
  draftSession.value = null
  sessionId.value = ''
  sessionName.value = ''
  selectedDatasetIds.value = []
  configLlmId.value = ''
  assistantTuningDraft.value = createEmptyAssistantTuningDraft()
  resetCitationUi({ closePanel: true })
  resetChat()
}

function createNewChat(): void {
  resetChat()
  citationsOpen.value = false
  resetCitationUi({ closePanel: true })
  if (!selectedChatId.value) {
    sessionId.value = ''
    sessionName.value = ''
    configErrorMessage.value = 'Select a RAGFlow assistant before creating a chat session.'
    return
  }

  draftSession.value = createDraftSession(selectedChatId.value)
  sessionId.value = DRAFT_SESSION_ID
  sessionName.value = draftSession.value.name
  configErrorMessage.value = ''
}

function selectSession(item: SessionItem): void {
  openSessionMenuId.value = ''
  resetChat()
  if (!item.isDraft) {
    draftSession.value = null
  }
  sessionId.value = item.id
  sessionName.value = item.name
  void scrollChatToBottom()
}

async function submitCurrentQuestion(): Promise<void> {
  if (!hasAvailableChat.value) {
    configErrorMessage.value =
      chatAvailabilityMessage.value || 'Select an available RAGFlow assistant before chatting.'
    return
  }

  const currentQuestion = question.value.trim()
  activeSourceReferenceNumber.value = null
  const shouldProcessCompletedChat = await submitChat()
  if (!shouldProcessCompletedChat) {
    return
  }

  if (chatErrorMessage.value) {
    if (isUnavailableChatError(chatErrorMessage.value, chatErrorCode.value)) {
      await recoverUnavailableChatSelection(chatErrorMessage.value)
    }
    return
  }

  const completedAnswer = streamedAnswer.value
  const completedQuestion = submittedQuestion.value || currentQuestion
  syncActiveSessionSummary()
  if (selectedChatId.value) {
    await loadSessions(selectedChatId.value)
  }
  if (
    sessionContainsExchange(completedQuestion, completedAnswer)
  ) {
    const persistedAssistant = findMatchingTranscriptMessage('assistant', completedAnswer)
    const currentAnswerHasPersistedReferences = Boolean(
      persistedAssistant &&
      persistedAssistant.references.length > 0,
    )
    const matchingMessageId = persistedAssistant?.id || `live-${Date.now()}`
    if (!currentAnswerHasPersistedReferences && liveSourceItems.value.length > 0) {
      storeSessionCitationSnapshot(
        sessionId.value,
        matchingMessageId,
        liveSourceItems.value,
      )
    }
    if (currentAnswerHasPersistedReferences || liveSourceItems.value.length > 0) {
      activeCitationMessageId.value = matchingMessageId
    } else {
      activeCitationMessageId.value = ''
    }
    clearTransientAnswer({ keepReferences: !currentAnswerHasPersistedReferences })
  }
}

function syncActiveSessionSummary(): void {
  if (!selectedChatId.value || !sessionId.value || isDraftSessionId(sessionId.value)) {
    return
  }

  sessions.value = upsertSessionSummary(sessions.value, {
    bizChatId: selectedChatId.value,
    bizSessionId: sessionId.value,
    name: sessionName.value || submittedQuestion.value,
  })
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
  if (!trimmedName || trimmedName === item.name) {
    return
  }

  if (!selectedChatId.value) {
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
    removeSessionCitationSnapshot(item.id)
    if (sessionId.value === item.id) {
      resetCitationUi({ closePanel: true })
      resetChat()
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

function handleQuestionKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()
  if (canSubmitChat.value) {
    void submitCurrentQuestion()
  }
}

async function copyAnswer(content: string): Promise<void> {
  const text = normalizeAnswerForAction(content)
  if (!text) {
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    flashAction('copy')
  } catch {
    flashAction('copy')
  }
}

function flashAction(actionKey: string): void {
  flashedActionKey.value = actionKey
  window.setTimeout(() => {
    if (flashedActionKey.value === actionKey) {
      flashedActionKey.value = ''
    }
  }, 420)
}

function toggleThought(messageId: string): void {
  if (openThoughtIds.value.includes(messageId)) {
    openThoughtIds.value = openThoughtIds.value.filter((id) => id !== messageId)
    return
  }

  openThoughtIds.value = [...openThoughtIds.value, messageId]
}

async function applyChatSelection(
  chatId: string,
  chatName: string,
  options: { recoverUnavailableChat?: boolean } = {},
): Promise<void> {
  isApplyingConfigSelection.value = true
  try {
    selectedChatId.value = chatId
    assistantChatId.value = chatId
    assistantName.value = chatName
    await loadSessions(chatId, options)
  } finally {
    isApplyingConfigSelection.value = false
  }
}

async function saveKnowledgeConfig(
  payload?: UpdateRagflowChatConfigDraftPayload,
): Promise<void> {
  const updatedChat = payload
    ? await persistAssistantConfig(payload)
    : await persistKnowledgeConfig()
  if (!updatedChat) {
    return
  }

  assistantName.value = updatedChat.name
  assistantChatId.value = updatedChat.biz_chat_id
  assistantTuningDraft.value = toAssistantTuningDraft(updatedChat)
  const firstDataset = datasets.value.find((dataset) => {
    return updatedChat.biz_knowledge_base_ids.includes(dataset.biz_knowledge_base_id)
  })
  if (firstDataset) {
    knowledgeBaseName.value = firstDataset.name
  } else {
    knowledgeBaseName.value = ''
  }
}

async function selectModel(model: ModelOption): Promise<void> {
  configLlmId.value = model.value
  modelOpen.value = false
  if (!isSavingConfig.value) {
    await saveModelConfig(model.value)
  }
}

async function saveModelConfig(modelId: string): Promise<void> {
  const updatedChat = await persistModelConfig(modelId)
  if (updatedChat) {
    assistantName.value = updatedChat.name
    assistantChatId.value = updatedChat.biz_chat_id
    assistantTuningDraft.value = toAssistantTuningDraft(updatedChat)
  }
}

async function scrollChatToBottom(): Promise<void> {
  await nextTick()
  const element = chatScrollElement.value
  if (!element) {
    return
  }

  element.scrollTop = element.scrollHeight
}

function splitThoughtContent(content: string): AnswerPresentation {
  const closedMatch = content.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i)
  if (closedMatch) {
    return {
      thought: closedMatch[1]?.trim() ?? '',
      answer: (closedMatch[2] ?? '').trim(),
      hasThought: true,
    }
  }

  const openMatch = content.match(/<think>([\s\S]*)/i)
  if (openMatch) {
    return {
      thought: openMatch[1]?.trim() ?? '',
      answer: '',
      hasThought: true,
    }
  }

  if (!content.toLowerCase().includes('</think>')) {
    return {
      answer: content,
      thought: '',
      hasThought: false,
    }
  }

  return {
    thought: '',
    answer: content.replace(/<\/?think>/gi, '').trim(),
    hasThought: true,
  }
}

function normalizeAnswerForAction(content: string): string {
  return splitThoughtContent(content).answer.trim()
}

function sessionContainsExchange(questionText: string, answerText: string): boolean {
  if (!questionText || !answerText) {
    return false
  }

  const questionWasPersisted = Boolean(findMatchingTranscriptMessage('user', questionText))
  const answerWasPersisted = Boolean(findMatchingTranscriptMessage('assistant', answerText))

  return questionWasPersisted && answerWasPersisted
}

function findMatchingTranscriptMessage(
  role: TranscriptMessage['role'],
  content: string,
): TranscriptMessage | null {
  for (let index = transcriptMessages.value.length - 1; index >= 0; index -= 1) {
    const message = transcriptMessages.value[index]
    if (message?.role === role && contentsAreEquivalent(message.content, content)) {
      return message
    }
  }

  return null
}

function contentsAreEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparableMessage(left)
  const normalizedRight = normalizeComparableMessage(right)
  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  if (normalizedLeft === normalizedRight) {
    return true
  }

  const shortest = normalizedLeft.length < normalizedRight.length ? normalizedLeft : normalizedRight
  const longest = normalizedLeft.length < normalizedRight.length ? normalizedRight : normalizedLeft
  return shortest.length >= 80 && longest.includes(shortest.slice(0, 80))
}

function normalizeComparableMessage(value: string): string {
  const presentation = splitThoughtContent(normalizeMessageContent(value))
  const normalizedValue = presentation.answer || presentation.thought || normalizeMessageContent(value)
  return normalizedValue.replace(/\s+/g, ' ').trim()
}

function readStringArray(storageKey: string): string[] {
  try {
    const value = window.localStorage.getItem(storageKey)
    if (!value) {
      return []
    }

    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function normalizeMessageContent(value: string): string {
  return value
    .replace(/^\*\*ERROR\*\*:\s*/i, '')
    .replace(/^ERROR:\s*/i, '')
    .trim()
}
</script>

<template>
  <AuthPanel
    v-if="!isAuthenticated"
    v-model:auth-email="authEmail"
    v-model:auth-nickname="authNickname"
    v-model:auth-password="authPassword"
    :auth-config="authConfig"
    :auth-error-message="authErrorMessage"
    :auth-mode="authMode"
    :auth-submit-label="authSubmitLabel"
    :auth-title="authTitle"
    :can-submit-auth="canSubmitAuth"
    @submit-auth="submitAuth"
    @switch-mode="switchAuthMode"
  />

  <MobileTopBar
    v-if="isAuthenticated"
    @check-health="checkHealth"
    @open-settings="isSettingsOpen = true"
  />

  <div v-if="isAuthenticated" class="flex h-full w-full min-h-0">
    <AppSidebar
      :avatar-url="authUser?.avatar || PROFILE_IMAGE_URL"
      :is-loading-sessions="isLoadingSessions"
      :open-session-menu-id="openSessionMenuId"
      :profile-name="profileName"
      :profile-subtitle="profileSubtitle"
      :session-id="sessionId"
      :session-items="sessionItems"
      @create-new-chat="createNewChat"
      @open-agent-config="isKnowledgeOpen = true"
      @open-knowledge="isKnowledgeOpen = true"
      @open-settings="isSettingsOpen = true"
      @remove-session="removeSession"
      @rename-session="renameSession"
      @select-session="selectSession"
      @sign-out="signOut"
      @toggle-pinned-session="togglePinnedSession"
      @toggle-session-menu="toggleSessionMenu"
    />
    <!-- Main Content Wrapper -->
    <main class="flex-1 md:ml-[260px] h-full min-h-0 min-w-0 flex flex-col md:flex-row overflow-hidden pb-16 md:pb-0">
      <!-- Middle Column: Source Citations (40%) -->
      <section v-show="citationsOpen" class="w-full md:w-[40%] bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden transition-all min-h-0 min-w-0">
        <header class="p-stack-md border-b border-outline-variant flex justify-between items-center bg-surface">
          <h2 class="font-headline-sm text-headline-sm font-semibold">Source Citations</h2>
          <span class="font-label-caps text-label-caps text-secondary bg-secondary-container px-2 py-1 rounded">{{ sourceCountLabel }}</span>
        </header>
        <div :ref="setSourceScrollElement" data-source-scroll="true" class="flex-1 min-h-0 overflow-y-auto p-stack-md space-y-stack-md custom-scrollbar">
          <div v-if="sourceItems.length === 0" class="flex flex-col items-center justify-center h-full text-center px-stack-lg space-y-stack-md opacity-60">
            <div class="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-outline mb-2">
              <span class="material-symbols-outlined text-[32px]" data-icon="find_in_page">find_in_page</span>
            </div>
            <div class="space-y-2">
              <h3 class="font-headline-sm text-on-surface font-semibold">No citations found yet</h3>
              <p class="font-body-md text-on-surface-variant max-w-[240px] mx-auto">
                Ask a question to see source references here.
              </p>
            </div>
          </div>

          <div
            v-for="source in sourceItems"
            :key="source.id"
            :data-source-key="sourceElementKey(source)"
            :ref="(element) => setSourceCardElement(source, element)"
            class="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md hover:border-secondary transition-all cursor-pointer"
            :class="{ 'source-card--active': activeSourceReferenceNumber === source.referenceNumber }"
            @click="selectSource(source)"
          >
            <div class="flex justify-between items-start mb-2">
              <span class="font-label-caps text-label-caps bg-surface-variant px-2 py-0.5 rounded text-on-surface-variant">{{ source.label }}</span>
              <span class="font-label-caps text-label-caps text-secondary font-bold">{{ source.score }}</span>
            </div>
            <h3 class="font-body-lg text-primary font-bold mb-1">{{ source.title }}</h3>
            <p class="text-on-surface-variant font-body-md italic mb-3">"...{{ source.content }}..."</p>
          </div>
        </div>
      </section>
      <!-- Right Column: AI Response Pane (60%) -->
      <section class="flex-1 bg-surface flex flex-col overflow-hidden relative min-h-0 min-w-0">
        <header class="p-stack-md border-b border-outline-variant flex items-center justify-between bg-surface/80 backdrop-blur-md sticky top-0 z-10">
          <div class="flex items-center gap-4">
            <button class="text-on-surface-variant hover:text-primary transition-colors focus:outline-none p-1.5 -ml-1.5 rounded-lg hover:bg-surface-container" title="Toggle Citations" type="button" @click="citationsOpen = !citationsOpen">
              <span class="material-symbols-outlined">{{ citationsOpen ? 'left_panel_close' : 'left_panel_open' }}</span>
            </button>
            <div class="bg-secondary-container text-secondary p-2 rounded-lg">
              <span class="material-symbols-outlined" data-icon="auto_awesome" data-weight="fill" style="font-variation-settings: 'FILL' 1;">auto_awesome</span>
            </div>
            <div>
              <h2 class="font-headline-sm text-headline-sm font-semibold">{{ chatTitle }}</h2>
              <p class="text-[12px] text-on-surface-variant uppercase tracking-wider font-label-caps">{{ chatSubtitle }}</p>
            </div>
          </div>
          <div class="relative">
            <button class="model-trigger" type="button" title="Select model" @click="modelOpen = !modelOpen">
              <span class="material-symbols-outlined text-[18px]" data-icon="memory">memory</span>
              <span class="material-symbols-outlined text-[18px]" data-icon="expand_more">expand_more</span>
            </button>
            <div v-show="modelOpen" class="absolute right-0 top-full mt-2 w-48 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden z-20">
              <a
                v-for="model in modelOptions"
                :key="model.value"
                class="block px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
                href="#"
                @click.prevent="selectModel(model)"
              >{{ model.label }}</a>
              <span v-if="modelOptions.length === 0" class="model-empty">No model options</span>
            </div>
          </div>
        </header>
        <div ref="chatScrollElement" class="flex-1 min-h-0 overflow-y-auto p-stack-md md:p-stack-lg custom-scrollbar space-y-stack-lg chat-scroll-area">
          <ChatMessageList
            :answer-is-error="answerIsError"
            :chat-error-message="chatErrorMessage"
            :displayed-transcript-messages="displayedTranscriptMessages"
            :flashed-action-key="flashedActionKey"
            :is-live-thinking-only="isLiveThinkingOnly"
            :is-streaming-chat="isStreamingChat"
            :live-answer-is-streaming="liveAnswerIsStreaming"
            :live-answer-presentation="liveAnswerPresentation"
            :live-answer-segments="liveAnswerSegments"
            :open-thought-ids="openThoughtIds"
            :reference-count="referenceCards.length"
            :should-show-answer="shouldShowAnswer"
            :streamed-answer="streamedAnswer"
            :submitted-question="submittedQuestion"
            @copy-answer="copyAnswer"
            @open-source-reference="openSourceReference"
            @toggle-thought="toggleThought"
          />
        </div>
        <!-- Chat Input Area -->
        <div class="chat-input-area">
          <p v-if="chatAvailabilityMessage" class="chat-availability-message">
            {{ chatAvailabilityMessage }}
          </p>
          <div class="max-w-4xl mx-auto flex items-center bg-surface-container-lowest border border-outline-variant rounded-xl p-2 shadow-sm focus-within:border-primary transition-all duration-200">
            <button class="p-2 text-on-surface-variant hover:text-primary transition-colors" type="button" @click="isKnowledgeOpen = true">
              <span class="material-symbols-outlined" data-icon="attach_file">attach_file</span>
            </button>
            <input v-model.trim="question" class="flex-1 bg-transparent border-none focus:ring-0 text-body-md px-2 placeholder:text-outline" :placeholder="chatInputPlaceholder" type="text" :disabled="!hasAvailableChat" @keydown="handleQuestionKeydown" />
            <div class="flex gap-1">
              <button class="p-2 text-on-surface-variant hover:text-primary transition-colors" type="button" @click="isSettingsOpen = true">
                <span class="material-symbols-outlined" data-icon="settings">settings</span>
              </button>
              <button v-if="isStreamingChat" class="bg-primary text-on-primary p-2 rounded-lg hover:bg-primary/90 transition-all active:scale-95" type="button" @click="cancelChat">
                <span class="material-symbols-outlined" data-icon="stop">stop</span>
              </button>
              <button v-else class="bg-primary text-on-primary p-2 rounded-lg hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50" type="button" :disabled="!canSubmitChat" @click="submitCurrentQuestion">
                <span class="material-symbols-outlined" data-icon="send">send</span>
              </button>
            </div>
          </div>
          <p class="text-center text-[10px] text-outline-variant mt-2 uppercase font-label-caps">Assistant may produce inaccurate information. Please verify citations.</p>
        </div>
      </section>
    </main>
  </div>

  <MobileNavigation
    v-if="isAuthenticated"
    @open-knowledge="isKnowledgeOpen = true"
    @open-settings="isSettingsOpen = true"
  />

  <KnowledgeDialog
    v-if="isKnowledgeOpen"
    v-model:selected-chat-id="selectedChatId"
    :chats="chats"
    :config-error-message="configErrorMessage"
    :datasets="datasets"
    :has-available-chat="hasAvailableChat"
    :is-loading-config="isLoadingConfig"
    :is-saving-config="isSavingConfig"
    :model-options="modelOptions"
    :selected-dataset-ids="selectedDatasetIds"
    :tuning-draft="assistantTuningDraft"
    @close="isKnowledgeOpen = false"
    @load-config="loadConfig"
    @save-config="saveKnowledgeConfig"
    @toggle-dataset="toggleDataset"
    @update:tuning-draft="assistantTuningDraft = $event"
  />

  <SessionDialog
    v-if="sessionDialogMode"
    v-model:pending-session-name="pendingSessionName"
    :is-busy="isSessionActionBusy"
    :mode="sessionDialogMode"
    :session-item="pendingSessionItem"
    :subtitle="sessionDialogSubtitle"
    :title="sessionDialogTitle"
    @close="closeSessionDialog"
    @confirm="confirmSessionDialog"
  />

  <SourceModal
    :preview="activeSourceModalPreview"
    :source="activeSourceModal"
    @close="closeSourceModal"
  />

  <SettingsDialog
    v-if="isSettingsOpen"
    :assistant-name="assistantName"
    :config-error-message="configErrorMessage"
    :health-status="healthStatus"
    :is-loading-config="isLoadingConfig"
    :knowledge-base-name="knowledgeBaseName"
    :profile-name="profileName"
    :profile-subtitle="profileSubtitle"
    @check-health="checkHealth"
    @close="isSettingsOpen = false"
    @reload="loadConfig"
    @sign-out="signOut"
  />
</template>

