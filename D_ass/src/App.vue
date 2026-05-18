<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch, type ComponentPublicInstance } from 'vue'

import { useRagWorkspace } from './composables/useRagWorkspace'
import { useSessionCitationSnapshots } from './composables/useSessionCitationSnapshots'
import {
  createRagflowChatSession,
  deleteRagflowChatSession,
  getRagflowConfig,
  listRagflowModels,
  listRagflowChatSessions,
  updateRagflowChatSession,
  updateRagflowChatConfig,
} from './lib/integration-api'
import { toFriendlyMessage } from './lib/workspace-errors'
import { toAnswerSegments } from './lib/workspace-presenters'
import {
  extractCitedReferenceNumbers,
  resolveReferenceNumbers,
  toLiveSourceItems,
  type SourceItem,
} from './lib/citation-sources'
import {
  resolveDisplayedSourceItems,
  resolveActiveCitationMessageId,
} from './lib/citation-state'
import type {
  ChatReference,
  RagflowChatConfig,
  RagflowDatasetConfig,
  RagflowModelOption,
  RagflowSession,
} from './types/integration'
import type { AnswerSegment } from './types/workspace'

interface SessionItem {
  id: string
  name: string
  isPinned: boolean
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

interface ModelOption {
  label: string
  value: string
}

type SessionDialogMode = 'rename' | 'delete'

interface AnswerPresentation {
  answer: string
  thought: string
  hasThought: boolean
}

interface SourceScrollTarget {
  container: HTMLElement
  element: HTMLElement
  source: SourceItem
}

interface SourceScrollPosition {
  top: number
  maxTop: number
}

const PROFILE_IMAGE_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDbV0EIMb7_6jlpqgIBumGrr4GpUZE_0i0TppiJtIlLBwFrjo0u4wZbHFbJ_l3rvQuplzUJrjKfzp8Kb1FHpN4PfzAGspFlJSpsMIfYkez0HKBF-gDKLpZ-ppeBKaMJLWLLx_FGh52AHmlO4dpd1CXeshfz5fL2kWbvd8DmN43MRd3n43iy24RRc8MdOlUsQRi2MBMyO6Edf5YBtQ2FRmUBGy7hBpRVIfOA1IbQQM7jTNTgq-iD9Ny8I1VdSoeh4GExy8w8uT_9_Jh2'

const PINNED_SESSIONS_STORAGE_KEY = 'documentation-assistant:pinned-sessions'
const SOURCE_CARD_RENDER_WAIT_FRAMES = 12
const SOURCE_CARD_FRAME_TIMEOUT_MS = 50
const SOURCE_CARD_SCROLL_ATTEMPTS = 4

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

const citationsOpen = ref<boolean>(false)
const modelOpen = ref<boolean>(false)
const openSessionMenuId = ref<string>('')
const isKnowledgeOpen = ref<boolean>(false)
const isSettingsOpen = ref<boolean>(false)
const isLoadingConfig = ref<boolean>(false)
const isLoadingSessions = ref<boolean>(false)
const isRecoveringChatSelection = ref<boolean>(false)
const isSavingConfig = ref<boolean>(false)
const configErrorMessage = ref<string>('')
const datasets = ref<RagflowDatasetConfig[]>([])
const chats = ref<RagflowChatConfig[]>([])
const sessions = ref<RagflowSession[]>([])
const availableModels = ref<RagflowModelOption[]>([])
const pinnedSessionIds = ref<string[]>(readStringArray(PINNED_SESSIONS_STORAGE_KEY))
const chatScrollElement = ref<HTMLElement | null>(null)
const sourceScrollElement = ref<HTMLElement | null>(null)
const sourceCardElements = new Map<string, HTMLElement>()
const openThoughtIds = ref<string[]>([])
const flashedActionKey = ref<string>('')
const sessionDialogMode = ref<SessionDialogMode | null>(null)
const pendingSessionItem = ref<SessionItem | null>(null)
const pendingSessionName = ref<string>('')
const isSessionActionBusy = ref<boolean>(false)
const activeSourceModal = ref<SourceItem | null>(null)
const activeCitationMessageId = ref<string>('')
const activeSourceReferenceNumber = ref<number | null>(null)
const sourceFocusSequence = ref<number>(0)
const selectedChatId = ref<string>('')
const selectedDatasetIds = ref<string[]>([])
const configLlmId = ref<string>('')

const selectedChat = computed(() => {
  return chats.value.find((chat) => chat.biz_chat_id === selectedChatId.value) ?? null
})

const hasAvailableChat = computed(() => {
  return chats.value.length > 0 && selectedChat.value !== null
})

const selectedSession = computed(() => {
  if (!sessionId.value) {
    return null
  }

  return sessions.value.find((session) => session.biz_session_id === sessionId.value) ?? null
})

const sessionItems = computed<SessionItem[]>(() => {
  return sessions.value
    .map((session) => {
      return {
        id: session.biz_session_id,
        name: session.name,
        isPinned: pinnedSessionIds.value.includes(session.biz_session_id),
      }
    })
    .sort((left, right) => Number(right.isPinned) - Number(left.isPinned))
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

const liveReferenceNumbers = computed(() => {
  return resolveReferenceNumbers(liveAnswerSegments.value, referenceCards.value.length)
})

const liveCitedReferenceNumbers = computed(() => {
  return extractCitedReferenceNumbers(liveAnswerSegments.value)
})

const liveSourceItems = computed<SourceItem[]>(() => {
  return toLiveSourceItems(
    referenceCards.value,
    liveReferenceNumbers.value,
    liveCitedReferenceNumbers.value,
  )
})

const isLiveThinkingOnly = computed(() => {
  return (
    isStreamingChat.value &&
    liveAnswerPresentation.value.hasThought &&
    liveAnswerPresentation.value.answer.length === 0
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

const sourceItems = computed<SourceItem[]>(() => {
  const hasLiveReferenceState =
    referenceCards.value.length > 0 &&
    liveCitedReferenceNumbers.value.length > 0 &&
    (
      isStreamingChat.value ||
      submittedQuestion.value.length > 0 ||
      streamedAnswer.value.length > 0
    )

  return resolveDisplayedSourceItems({
    activeCitationMessageId: activeCitationMessageId.value,
    hasLiveReferenceState,
    liveSourceItems: liveSourceItems.value,
    messages: transcriptMessages.value,
    readLatestSnapshot: readLatestSessionCitationSnapshot,
    readSnapshot: readSessionCitationSnapshot,
    sessionId: sessionId.value,
  })
})

const sourceCountLabel = computed(() => {
  return `${sourceItems.value.length} SOURCES FOUND`
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

const activeSourceModalPreview = computed(() => {
  if (!activeSourceModal.value) {
    return ''
  }

  return activeSourceModal.value.fullContent.trim()
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

const modelOptions = computed<ModelOption[]>(() => {
  const options: ModelOption[] = []
  const seenValues = new Set<string>()
  const addOption = (label: string, value: string): void => {
    const normalizedValue = value.trim()
    if (!normalizedValue || seenValues.has(normalizedValue)) {
      return
    }

    seenValues.add(normalizedValue)
    options.push({
      label: label.trim() || normalizedValue,
      value: normalizedValue,
    })
  }

  addOption(configLlmId.value, configLlmId.value)
  for (const model of availableModels.value) {
    addOption(model.label, model.model_id)
  }
  for (const chat of chats.value) {
    addOption(chat.llm_id, chat.llm_id)
  }

  return options
})

watch(selectedChat, (chat) => {
  if (!chat) {
    assistantChatId.value = ''
    assistantName.value = ''
    selectedDatasetIds.value = []
    return
  }

  assistantChatId.value = chat.biz_chat_id
  assistantName.value = chat.name
  selectedDatasetIds.value = [...chat.biz_knowledge_base_ids]
  configLlmId.value = chat.llm_id
})

watch(selectedChatId, async (nextChatId, previousChatId) => {
  if (
    !nextChatId ||
    nextChatId === previousChatId ||
    isLoadingConfig.value ||
    isRecoveringChatSelection.value
  ) {
    return
  }

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

watch(sourceItems, (items) => {
  pruneSourceCardElements(items)
  if (items.length > 0) {
    if (
      activeSourceReferenceNumber.value !== null &&
      !items.some((item) => item.referenceNumber === activeSourceReferenceNumber.value)
    ) {
      activeSourceReferenceNumber.value = null
    }
    const activeModal = activeSourceModal.value
    if (activeModal) {
      const modalIsStillVisible = items.some((item) => {
        return sourceElementKey(item) === sourceElementKey(activeModal)
      })
      if (!modalIsStillVisible) {
        activeSourceModal.value = null
      }
    }
    citationsOpen.value = true
    return
  }

  activeSourceModal.value = null
  activeSourceReferenceNumber.value = null
  sourceCardElements.clear()
})

watch(
  [displayedTranscriptMessages, submittedQuestion, streamedAnswer, isStreamingChat],
  () => {
    void scrollChatToBottom()
  },
  { deep: true },
)

onMounted(() => {
  void loadConfig()
})

async function loadConfig(): Promise<void> {
  configErrorMessage.value = ''
  isLoadingConfig.value = true

  try {
    const config = await getRagflowConfig()
    datasets.value = config.datasets
    chats.value = config.chats
    await loadModels()
    const currentChat =
      config.chats.find((chat) => chat.biz_chat_id === selectedChatId.value) ??
      config.chats.find((chat) => chat.name === assistantName.value) ??
      config.chats[0] ??
      null
    if (currentChat) {
      selectedChatId.value = currentChat.biz_chat_id
      assistantChatId.value = currentChat.biz_chat_id
      assistantName.value = currentChat.name
      await loadSessions(currentChat.biz_chat_id)
    } else {
      selectedChatId.value = ''
      clearUnavailableChatState()
      configErrorMessage.value =
        'No RAGFlow chat assistant is available. Create one in RAGFlow, then refresh config.'
    }
  } catch (error: unknown) {
    configErrorMessage.value = toFriendlyMessage(error, 'Failed to load RAGFlow config.')
  } finally {
    isLoadingConfig.value = false
  }
}

async function loadModels(): Promise<void> {
  try {
    const response = await listRagflowModels()
    availableModels.value = response.models
  } catch (error: unknown) {
    availableModels.value = []
    configErrorMessage.value = toFriendlyMessage(error, 'Failed to load RAGFlow models.')
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
    sessionId.value = ''
    sessionName.value = ''
    activeCitationMessageId.value = ''
    activeSourceReferenceNumber.value = null
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
    datasets.value = config.datasets
    chats.value = config.chats
    await loadModels()

    const replacementChat = config.chats[0] ?? null
    if (!replacementChat) {
      selectedChatId.value = ''
      clearUnavailableChatState()
      configErrorMessage.value =
        'The selected RAGFlow assistant was removed. Create one in RAGFlow, then refresh config.'
      return
    }

    selectedChatId.value = replacementChat.biz_chat_id
    assistantChatId.value = replacementChat.biz_chat_id
    assistantName.value = replacementChat.name
    await loadSessions(replacementChat.biz_chat_id, { recoverUnavailableChat: false })
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
  sessionId.value = ''
  sessionName.value = ''
  selectedDatasetIds.value = []
  resetCitationUi({ closePanel: true })
  resetChat()
}

function resetCitationUi(options: { closePanel?: boolean } = {}): void {
  sourceFocusSequence.value += 1
  activeSourceModal.value = null
  activeCitationMessageId.value = ''
  activeSourceReferenceNumber.value = null
  sourceCardElements.clear()
  if (options.closePanel) {
    citationsOpen.value = false
  }
}

async function createNewChat(): Promise<void> {
  resetChat()
  citationsOpen.value = false
  if (!selectedChatId.value) {
    sessionId.value = ''
    sessionName.value = ''
    configErrorMessage.value = 'Select a RAGFlow assistant before creating a chat session.'
    return
  }

  const nextName = `Recent Chat ${new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date())}`

  try {
    const createdSession = await createRagflowChatSession(selectedChatId.value, {
      name: nextName,
    })
    sessionId.value = createdSession.biz_session_id
    sessionName.value = createdSession.name
    await loadSessions(selectedChatId.value)
  } catch (error: unknown) {
    configErrorMessage.value = toFriendlyMessage(error, 'Failed to create RAGFlow session.')
  }
}

function selectSession(item: SessionItem): void {
  openSessionMenuId.value = ''
  resetChat()
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
  await submitChat()

  if (chatErrorMessage.value) {
    if (isUnavailableChatError(chatErrorMessage.value, chatErrorCode.value)) {
      await recoverUnavailableChatSelection(chatErrorMessage.value)
    }
    return
  }

  const completedAnswer = streamedAnswer.value
  const completedQuestion = submittedQuestion.value || currentQuestion
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
      activeSourceModal.value = null
      citationsOpen.value = false
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

function selectSource(source: SourceItem): void {
  void openSourceReference(source.referenceNumber, { openModal: true })
}

async function openSourceReference(
  referenceNumber: number | null,
  options: { messageId?: string; openModal?: boolean } = {},
): Promise<void> {
  if (referenceNumber === null) {
    return
  }

  const focusSequence = sourceFocusSequence.value + 1
  sourceFocusSequence.value = focusSequence

  activeSourceModal.value = null
  if (options.messageId) {
    activeCitationMessageId.value = options.messageId
  }

  citationsOpen.value = true
  activeSourceReferenceNumber.value = referenceNumber
  await nextTick()
  const target = await waitForSourceScrollTarget(referenceNumber, focusSequence)
  if (focusSequence !== sourceFocusSequence.value) {
    return
  }

  if (!target) {
    activeSourceReferenceNumber.value = null
    return
  }

  handleReferenceSelection(referenceNumber)
  activeSourceReferenceNumber.value = referenceNumber
  if (options.openModal) {
    activeSourceModal.value = target.source
  }
  const centeredTarget = await centerSourceCard(referenceNumber, focusSequence, target)
  if (options.openModal && centeredTarget) {
    activeSourceModal.value = centeredTarget.source
  }
}

function closeSourceModal(): void {
  activeSourceModal.value = null
}

function storeSessionCitationSnapshot(
  nextSessionId: string,
  messageId: string,
  items: SourceItem[],
): void {
  writeSessionCitationSnapshot(nextSessionId, messageId, items)
}

function setSourceCardElement(
  source: SourceItem,
  element: Element | ComponentPublicInstance | null,
): void {
  if (!(element instanceof HTMLElement)) {
    return
  }

  sourceCardElements.set(sourceElementKey(source), element)
}

function pruneSourceCardElements(items: SourceItem[]): void {
  const validKeys = new Set(items.map(sourceElementKey))
  const container = sourceScrollElement.value

  for (const [key, element] of sourceCardElements.entries()) {
    if (!validKeys.has(key) || (container && !container.contains(element))) {
      sourceCardElements.delete(key)
    }
  }
}

async function centerSourceCard(
  referenceNumber: number,
  focusSequence: number,
  target: SourceScrollTarget,
): Promise<SourceScrollTarget | null> {
  let currentTarget: SourceScrollTarget | null = target

  for (let attempt = 0; attempt < SOURCE_CARD_SCROLL_ATTEMPTS; attempt += 1) {
    if (focusSequence !== sourceFocusSequence.value) {
      return null
    }

    currentTarget = resolveSourceScrollTarget(referenceNumber) ?? currentTarget
    if (!currentTarget) {
      return null
    }

    applySourceScrollPosition(currentTarget)
    await waitForNextFrame()
    if (focusSequence !== sourceFocusSequence.value) {
      return null
    }

    const refreshedTarget = resolveSourceScrollTarget(referenceNumber)
    if (refreshedTarget) {
      currentTarget = refreshedTarget
      if (sourceCardIsCentered(refreshedTarget)) {
        return refreshedTarget
      }
    }
  }

  if (currentTarget) {
    applySourceScrollPosition(currentTarget)
  }

  return currentTarget
}

function applySourceScrollPosition(target: SourceScrollTarget): void {
  const { container, element } = target
  const position = calculateSourceScrollPosition(container, element)
  container.scrollTop = position.top
}

function calculateSourceScrollPosition(
  container: HTMLElement,
  element: HTMLElement,
): SourceScrollPosition {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const rawTop =
    container.scrollTop +
    elementRect.top -
    containerRect.top -
    (container.clientHeight - elementRect.height) / 2
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
  const top = Math.min(maxTop, Math.max(0, rawTop))
  return { top, maxTop }
}

function sourceCardIsCentered(target: SourceScrollTarget): boolean {
  const { container, element } = target
  if (!container.contains(element)) {
    return false
  }

  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const elementCenter = elementRect.top + elementRect.height / 2
  return (
    elementCenter >= containerRect.top + containerRect.height * 0.25 &&
    elementCenter <= containerRect.bottom - containerRect.height * 0.25
  )
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let hasResolved = false
    let timeoutId = 0

    const resolveOnce = (): void => {
      if (hasResolved) {
        return
      }

      hasResolved = true
      window.clearTimeout(timeoutId)
      resolve()
    }

    timeoutId = window.setTimeout(resolveOnce, SOURCE_CARD_FRAME_TIMEOUT_MS)
    window.requestAnimationFrame(resolveOnce)
  })
}

async function waitForSourceScrollTarget(
  referenceNumber: number,
  focusSequence: number,
): Promise<SourceScrollTarget | null> {
  for (let attempt = 0; attempt < SOURCE_CARD_RENDER_WAIT_FRAMES; attempt += 1) {
    await nextTick()
    await waitForNextFrame()
    if (focusSequence !== sourceFocusSequence.value) {
      return null
    }

    const target = resolveSourceScrollTarget(referenceNumber)
    if (target) {
      return target
    }
  }

  return null
}

function resolveSourceScrollTarget(referenceNumber: number): SourceScrollTarget | null {
  const source = sourceItems.value.find((item) => {
    return item.referenceNumber === referenceNumber
  })
  if (!source) {
    return null
  }

  const container = sourceScrollElement.value
  const element = findSourceCardElement(source, container)
  return toReadySourceScrollTarget(container, element, source)
}

function findSourceCardElement(
  source: SourceItem,
  container: HTMLElement | null,
): HTMLElement | null {
  const key = sourceElementKey(source)
  const registeredElement = sourceCardElements.get(key)
  if (registeredElement && container?.contains(registeredElement)) {
    return registeredElement
  }

  return container?.querySelector<HTMLElement>(`[data-source-key="${key}"]`) ?? null
}

function toReadySourceScrollTarget(
  container: HTMLElement | null,
  element: HTMLElement | null | undefined,
  source: SourceItem,
): SourceScrollTarget | null {
  if (!container || !element) {
    return null
  }

  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  if (containerRect.height <= 0 || elementRect.height <= 0) {
    return null
  }

  return {
    container,
    element,
    source,
  }
}

function sourceElementKey(source: SourceItem): string {
  return `${source.referenceNumber}-${hashSourceId(source.id)}`
}

function hashSourceId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
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

function isThoughtOpen(messageId: string): boolean {
  return openThoughtIds.value.includes(messageId)
}

async function saveKnowledgeConfig(): Promise<void> {
  if (!selectedChatId.value) {
    configErrorMessage.value = 'Select a RAGFlow assistant first.'
    return
  }

  configErrorMessage.value = ''
  isSavingConfig.value = true

  try {
    const updatedChat = await updateRagflowChatConfig({
      biz_chat_id: selectedChatId.value,
      biz_knowledge_base_ids: selectedDatasetIds.value,
    })
    chats.value = chats.value.map((chat) => {
      return chat.biz_chat_id === updatedChat.biz_chat_id ? updatedChat : chat
    })
    selectedChatId.value = updatedChat.biz_chat_id
    assistantName.value = updatedChat.name
    assistantChatId.value = updatedChat.biz_chat_id
    const firstDataset = datasets.value.find((dataset) => {
      return updatedChat.biz_knowledge_base_ids.includes(dataset.biz_knowledge_base_id)
    })
    if (firstDataset) {
      knowledgeBaseName.value = firstDataset.name
    }
  } catch (error: unknown) {
    configErrorMessage.value = toFriendlyMessage(error, 'Failed to save RAGFlow knowledge config.')
  } finally {
    isSavingConfig.value = false
  }
}

function toggleDataset(datasetId: string): void {
  if (selectedDatasetIds.value.includes(datasetId)) {
    selectedDatasetIds.value = selectedDatasetIds.value.filter((id) => id !== datasetId)
    return
  }

  selectedDatasetIds.value = [...selectedDatasetIds.value, datasetId]
}

async function selectModel(model: ModelOption): Promise<void> {
  configLlmId.value = model.value
  modelOpen.value = false
  if (!isSavingConfig.value) {
    await saveModelConfig(model.value)
  }
}

async function saveModelConfig(modelId: string): Promise<void> {
  if (!selectedChatId.value) {
    configErrorMessage.value = 'Select a RAGFlow assistant first.'
    return
  }

  configErrorMessage.value = ''
  isSavingConfig.value = true

  try {
    const updatedChat = await updateRagflowChatConfig({
      biz_chat_id: selectedChatId.value,
      biz_knowledge_base_ids: selectedDatasetIds.value,
      llm_id: modelId.trim() || undefined,
    })
    chats.value = chats.value.map((chat) => {
      return chat.biz_chat_id === updatedChat.biz_chat_id ? updatedChat : chat
    })
    selectedChatId.value = updatedChat.biz_chat_id
    assistantName.value = updatedChat.name
    assistantChatId.value = updatedChat.biz_chat_id
    configLlmId.value = updatedChat.llm_id
  } catch (error: unknown) {
    configErrorMessage.value = toFriendlyMessage(error, 'Failed to save RAGFlow model config.')
  } finally {
    isSavingConfig.value = false
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
  <!-- Mobile Top Bar -->
  <header class="flex justify-between items-center w-full px-container-padding-mobile py-stack-sm bg-surface border-b border-outline-variant md:hidden">
    <div class="font-headline-sm text-headline-sm font-bold text-primary">Research Assistant</div>
    <div class="flex gap-stack-sm">
      <span class="material-symbols-outlined hover:bg-surface-container-low rounded-full p-2 transition-all duration-200 cursor-pointer" data-icon="notifications" @click="checkHealth">notifications</span>
      <span class="material-symbols-outlined hover:bg-surface-container-low rounded-full p-2 transition-all duration-200 cursor-pointer" data-icon="account_circle" @click="isSettingsOpen = true">account_circle</span>
    </div>
  </header>
  <div class="flex h-full w-full min-h-0">
    <!-- Sidebar Navigation -->
    <aside class="fixed left-0 top-0 h-full z-40 py-stack-md px-stack-sm w-[260px] flex-col hidden md:flex bg-surface border-r border-outline-variant">
      <div class="mb-stack-lg px-stack-sm">
        <h1 class="font-headline-md text-headline-md font-bold text-primary">Research Assistant</h1>
        <p class="font-body-md text-body-md text-on-surface-variant">AI Knowledge Base</p>
      </div>
      <button class="mx-stack-sm mb-stack-lg bg-primary text-on-primary py-stack-sm px-stack-md rounded-lg font-label-caps text-label-caps flex items-center justify-center gap-2 active:scale-95 transition-transform" type="button" @click="createNewChat">
        <span class="material-symbols-outlined text-[18px]" data-icon="add">add</span>
        New Chat
      </button>
      <nav class="flex-1 space-y-1">
        <div class="mt-4 mb-2 px-stack-sm">
          <p class="text-[11px] font-bold text-outline uppercase tracking-wider mb-2">Chat Sessions</p>
          <div class="space-y-1">
            <div
              v-for="item in sessionItems.slice(0, 12)"
              :key="item.id"
              class="group relative flex items-center"
            >
              <a
                class="flex-1 block px-stack-sm py-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors duration-200 text-[13px] truncate"
                :class="{ 'bg-surface-container font-bold text-primary': item.id === sessionId }"
                href="#"
                @click.prevent="selectSession(item)"
              >
                <span v-if="item.isPinned" class="material-symbols-outlined text-[12px]">push_pin</span>
                {{ item.name }}
              </a>
              <button class="absolute right-1 group-hover:opacity-100 p-1 hover:bg-surface-container-high rounded transition-all duration-200 text-on-surface-variant hover:text-primary opacity-40" type="button" @click.stop="toggleSessionMenu(item)">
                <span class="material-symbols-outlined text-[18px]">more_vert</span>
              </button>
              <div v-if="openSessionMenuId === item.id" class="session-menu">
                <button type="button" class="session-menu__item" @click.stop="togglePinnedSession(item)">
                  <span class="material-symbols-outlined text-[16px]">{{ item.isPinned ? 'keep_off' : 'push_pin' }}</span>
                  {{ item.isPinned ? 'Unpin' : 'Pin' }}
                </button>
                <button type="button" class="session-menu__item" @click.stop="renameSession(item)">
                  <span class="material-symbols-outlined text-[16px]">edit</span>
                  Rename
                </button>
                <button type="button" class="session-menu__item session-menu__item--danger" @click.stop="removeSession(item)">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                  Delete
                </button>
              </div>
            </div>
          </div>
          <p v-if="isLoadingSessions" class="text-[11px] text-outline mt-2 px-stack-sm">Loading sessions...</p>
          <p v-else-if="sessionItems.length === 0" class="text-[11px] text-outline mt-2 px-stack-sm">No chat sessions</p>
        </div>
      </nav>
      <div class="mt-auto border-t border-outline-variant pt-stack-md space-y-1">
        <a class="flex items-center gap-3 px-stack-sm py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors duration-200" href="#" @click.prevent="isKnowledgeOpen = true">
          <span class="material-symbols-outlined" data-icon="database">database</span>
          <span class="font-body-md">Knowledge Base</span>
        </a>
        <a class="flex items-center gap-3 px-stack-sm py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors duration-200" href="#" @click.prevent="isSettingsOpen = true">
          <span class="material-symbols-outlined" data-icon="settings">settings</span>
          <span class="font-body-md">Settings</span>
        </a>
        <div class="flex items-center gap-3 px-stack-sm py-4">
          <img class="w-8 h-8 rounded-full border border-outline-variant" data-alt="A professional portrait of a business researcher" :src="PROFILE_IMAGE_URL" />
          <div class="overflow-hidden">
            <p class="text-on-surface font-bold truncate">Alex Sterling</p>
            <p class="text-on-surface-variant text-[11px] truncate">{{ healthStatus }}</p>
          </div>
        </div>
      </div>
    </aside>
    <!-- Main Content Wrapper -->
    <main class="flex-1 md:ml-[260px] h-full min-h-0 min-w-0 flex flex-col md:flex-row overflow-hidden pb-16 md:pb-0">
      <!-- Middle Column: Source Citations (40%) -->
      <section v-show="citationsOpen" class="w-full md:w-[40%] bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden transition-all min-h-0 min-w-0">
        <header class="p-stack-md border-b border-outline-variant flex justify-between items-center bg-surface">
          <h2 class="font-headline-sm text-headline-sm font-semibold">Source Citations</h2>
          <span class="font-label-caps text-label-caps text-secondary bg-secondary-container px-2 py-1 rounded">{{ sourceCountLabel }}</span>
        </header>
        <div ref="sourceScrollElement" data-source-scroll="true" class="flex-1 min-h-0 overflow-y-auto p-stack-md space-y-stack-md custom-scrollbar">
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
          <template v-for="message in displayedTranscriptMessages" :key="message.id">
              <div v-if="message.role === 'user'" class="flex justify-end">
                <div class="max-w-[85%] bg-surface-container-low border border-outline-variant rounded-2xl rounded-tr-none p-stack-md">
                  <p class="font-body-md text-on-surface">{{ message.content }}</p>
                </div>
              </div>
              <div v-else class="flex justify-start items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
                  <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
                </div>
                <div class="max-w-[90%] bg-surface-container-lowest border border-outline-variant rounded-2xl rounded-tl-none p-stack-md shadow-sm">
                  <button
                    v-if="message.hasThought"
                    class="thought-toggle"
                    type="button"
                    @click="toggleThought(message.id)"
                  >
                    <span class="material-symbols-outlined text-[16px]">{{ isThoughtOpen(message.id) ? 'expand_less' : 'psychology' }}</span>
                    {{ isThoughtOpen(message.id) ? 'Hide Thinking' : 'Show Thinking' }}
                  </button>
                  <div v-if="message.hasThought && isThoughtOpen(message.id)" class="thought-panel">
                    {{ message.thoughtContent }}
                  </div>
                  <p class="font-body-lg text-on-background whitespace-pre-wrap">
                    <template v-if="message.answerSegments.length > 0">
                      <template v-for="segment in message.answerSegments" :key="segment.key">
                        <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
                        <button
                          v-else
                          class="citation-badge"
                          type="button"
                          @click="openSourceReference(segment.referenceNumber, { messageId: message.id })"
                        >{{ segment.referenceNumber }}</button>
                      </template>
                    </template>
                    <span v-else>{{ message.answerContent }}</span>
                  </p>
                  <div class="message-actions">
                    <button
                      type="button"
                      class="message-action"
                      :class="{ 'message-action--flash': flashedActionKey === 'copy' }"
                      title="Copy"
                      @click="copyAnswer(message.content)"
                    >
                      <span class="material-symbols-outlined text-[15px]">content_copy</span>
                    </button>
                  </div>
                </div>
              </div>
          </template>

          <div v-if="submittedQuestion" class="flex justify-end">
            <div class="max-w-[85%] bg-surface-container-low border border-outline-variant rounded-2xl rounded-tr-none p-stack-md">
              <p class="font-body-md text-on-surface">{{ submittedQuestion }}</p>
            </div>
          </div>

          <div v-if="shouldShowAnswer" class="flex justify-start items-start gap-4">
            <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
              <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
            </div>
            <div class="max-w-[90%] bg-surface-container-lowest border border-outline-variant rounded-2xl rounded-tl-none p-stack-md shadow-sm">
              <div class="space-y-4">
                <p v-if="chatErrorMessage || answerIsError" class="font-body-md text-error whitespace-pre-wrap">{{ chatErrorMessage || streamedAnswer }}</p>
                <template v-else>
                  <div v-if="isLiveThinkingOnly" class="thinking-state">
                    <button
                      class="thought-toggle thought-toggle--streaming"
                      type="button"
                      @click="toggleThought('live-answer')"
                    >
                      <span class="material-symbols-outlined text-[16px]">{{ isThoughtOpen('live-answer') ? 'expand_less' : 'psychology' }}</span>
                      Thinking...
                    </button>
                    <div v-if="isThoughtOpen('live-answer')" class="thought-panel">
                      {{ liveAnswerPresentation.thought }}
                    </div>
                  </div>
                  <template v-else>
                    <button
                      v-if="liveAnswerPresentation.hasThought"
                      class="thought-toggle"
                      type="button"
                      @click="toggleThought('live-answer')"
                    >
                      <span class="material-symbols-outlined text-[16px]">{{ isThoughtOpen('live-answer') ? 'expand_less' : 'psychology' }}</span>
                      {{ isThoughtOpen('live-answer') ? 'Hide Thinking' : 'Show Thinking' }}
                    </button>
                    <div v-if="liveAnswerPresentation.hasThought && isThoughtOpen('live-answer')" class="thought-panel">
                      {{ liveAnswerPresentation.thought }}
                    </div>
                    <p class="font-body-lg text-on-background whitespace-pre-wrap">
                      <template v-if="liveAnswerSegments.length > 0">
                        <template v-for="segment in liveAnswerSegments" :key="segment.key">
                          <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
                          <button
                            v-else
                            class="citation-badge"
                            type="button"
                            @click="openSourceReference(segment.referenceNumber)"
                          >{{ segment.referenceNumber }}</button>
                        </template>
                      </template>
                    </p>
                    <div v-if="!isStreamingChat" class="message-actions">
                      <button
                        type="button"
                        class="message-action"
                        :class="{ 'message-action--flash': flashedActionKey === 'copy' }"
                        title="Copy"
                        @click="copyAnswer(streamedAnswer)"
                      >
                        <span class="material-symbols-outlined text-[15px]">content_copy</span>
                      </button>
                    </div>
                  </template>
                </template>
                <div v-if="referenceCards.length > 0" class="p-stack-sm bg-secondary-container/20 rounded-lg border border-secondary/10 flex gap-3">
                  <span class="material-symbols-outlined text-secondary" data-icon="lightbulb">lightbulb</span>
                  <p class="text-[13px] text-on-secondary-fixed-variant italic">Consider reviewing the cited source cards to verify the response against RAGFlow references.</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="chatErrorMessage" class="flex justify-start items-start gap-4">
            <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
              <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
            </div>
            <div class="max-w-[90%] bg-error-container border border-outline-variant rounded-2xl rounded-tl-none p-stack-md shadow-sm">
              <p class="font-body-md text-error whitespace-pre-wrap">{{ chatErrorMessage }}</p>
            </div>
          </div>

          <div v-if="isStreamingChat && !shouldShowAnswer" class="flex justify-start items-start gap-4">
            <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
              <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
            </div>
            <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-3 flex gap-1">
              <span class="w-1.5 h-1.5 bg-secondary/40 rounded-full"></span>
              <span class="w-1.5 h-1.5 bg-secondary/70 rounded-full"></span>
              <span class="w-1.5 h-1.5 bg-secondary rounded-full"></span>
            </div>
          </div>
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
                <span class="material-symbols-outlined" data-icon="mic">mic</span>
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
  <!-- Mobile Navigation Bar -->
  <nav class="flex justify-around items-center h-16 w-full z-50 bg-surface border-t border-outline-variant fixed bottom-0 md:hidden shadow-lg">
    <div class="flex flex-col items-center gap-1 text-secondary scale-110">
      <span class="material-symbols-outlined" data-icon="chat">chat</span>
      <span class="font-label-caps text-[10px]">Chat</span>
    </div>
    <button class="flex flex-col items-center gap-1 text-on-surface-variant" type="button" @click="isKnowledgeOpen = true">
      <span class="material-symbols-outlined" data-icon="database">database</span>
      <span class="font-label-caps text-[10px]">Knowledge</span>
    </button>
    <button class="flex flex-col items-center gap-1 text-on-surface-variant" type="button" @click="isSettingsOpen = true">
      <span class="material-symbols-outlined" data-icon="settings">settings</span>
      <span class="font-label-caps text-[10px]">Settings</span>
    </button>
  </nav>

  <div v-if="isKnowledgeOpen" class="dialog-backdrop" @click.self="isKnowledgeOpen = false">
    <section class="dialog-panel dialog-panel--wide">
      <header class="dialog-header">
        <div>
          <p>Knowledge Base</p>
          <h2>RAGFlow Assistant Knowledge</h2>
        </div>
        <button type="button" class="dialog-close" @click="isKnowledgeOpen = false">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <div class="settings-grid knowledge-assistant-grid">
        <label>
          <span>Assistant</span>
          <select v-model="selectedChatId">
            <option value="" disabled>
              No assistant available
            </option>
            <option v-for="chat in chats" :key="chat.biz_chat_id" :value="chat.biz_chat_id">
              {{ chat.name }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="configErrorMessage" class="dialog-error">{{ configErrorMessage }}</p>
      <div class="dataset-list">
        <label
          v-for="dataset in datasets"
          :key="dataset.biz_knowledge_base_id"
          class="dataset-option"
        >
          <input
            type="checkbox"
            :checked="selectedDatasetIds.includes(dataset.biz_knowledge_base_id)"
            @change="toggleDataset(dataset.biz_knowledge_base_id)"
          />
          <span>
            <strong>{{ dataset.name }}</strong>
            <small>{{ dataset.embedding_model || 'No embedding model' }} | {{ dataset.document_count }} docs | {{ dataset.chunk_count }} chunks</small>
          </span>
        </label>
      </div>
      <div class="dialog-actions">
        <button type="button" class="dialog-action" :disabled="isLoadingConfig" @click="loadConfig">
          {{ isLoadingConfig ? 'Loading...' : 'Refresh RAGFlow Config' }}
        </button>
        <button type="button" class="dialog-action dialog-action--primary" :disabled="isSavingConfig || !hasAvailableChat" @click="saveKnowledgeConfig">
          {{ isSavingConfig ? 'Saving...' : 'Save Knowledge Config' }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="sessionDialogMode" class="dialog-backdrop" @click.self="closeSessionDialog">
    <section class="dialog-panel dialog-panel--compact">
      <header class="dialog-header">
        <div>
          <p>Chat Sessions</p>
          <h2>{{ sessionDialogTitle }}</h2>
        </div>
        <button type="button" class="dialog-close" @click="closeSessionDialog">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <p class="dialog-copy">{{ sessionDialogSubtitle }}</p>

      <label v-if="sessionDialogMode === 'rename'" class="prompt-field">
        <span>Session Name</span>
        <input v-model.trim="pendingSessionName" type="text" @keydown.enter.prevent="confirmSessionDialog" />
      </label>

      <div v-else class="delete-preview">
        <span class="material-symbols-outlined text-error">warning</span>
        <div>
          <strong>{{ pendingSessionItem?.name }}</strong>
          <small>This action cannot be undone for RAGFlow-backed sessions.</small>
        </div>
      </div>

      <div class="dialog-actions">
        <button type="button" class="dialog-action" :disabled="isSessionActionBusy" @click="closeSessionDialog">
          Cancel
        </button>
        <button
          type="button"
          class="dialog-action dialog-action--primary"
          :disabled="isSessionActionBusy || (sessionDialogMode === 'rename' && pendingSessionName.trim().length === 0)"
          @click="confirmSessionDialog"
        >
          {{ isSessionActionBusy ? 'Working...' : (sessionDialogMode === 'delete' ? 'Delete' : 'Save') }}
        </button>
      </div>
    </section>
  </div>

  <div
    v-if="activeSourceModal"
    class="fixed inset-0 z-50 flex items-center justify-center p-container-padding-mobile md:p-container-padding-desktop bg-on-background/40 backdrop-blur-sm animate-in fade-in duration-200"
    @click.self="closeSourceModal"
  >
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-outline-variant">
      <div class="flex items-center justify-between px-stack-md py-stack-md border-b border-outline-variant">
        <div class="flex items-center gap-3 min-w-0">
          <span class="material-symbols-outlined text-secondary" data-icon="article">article</span>
          <h2 class="font-headline-sm text-headline-sm text-primary truncate">{{ activeSourceModal.title }}</h2>
        </div>
        <button class="p-2 hover:bg-surface-container rounded-full transition-colors" type="button" @click="closeSourceModal">
          <span class="material-symbols-outlined" data-icon="close">close</span>
        </button>
      </div>

      <div class="p-stack-lg space-y-stack-md">
        <div class="flex items-center gap-gutter text-on-surface-variant pb-stack-md border-b border-outline-variant">
          <div class="flex flex-col min-w-0">
            <span class="font-label-caps text-[10px] uppercase tracking-wider">Source</span>
            <span class="font-body-md text-on-surface font-medium truncate">{{ activeSourceModal.sourceName }}</span>
          </div>
          <div class="w-px h-8 bg-outline-variant"></div>
          <div class="flex flex-col">
            <span class="font-label-caps text-[10px] uppercase tracking-wider">Reference</span>
            <span class="font-body-md text-on-surface font-medium">REF [{{ activeSourceModal.referenceNumber }}]</span>
          </div>
        </div>

        <div class="relative py-stack-sm source-modal-body custom-scrollbar">
          <div class="absolute -left-4 top-0 bottom-0 w-1 bg-secondary/30 rounded-full"></div>
          <p class="font-body-lg text-body-lg leading-relaxed text-on-surface whitespace-pre-wrap">{{ activeSourceModalPreview }}</p>
        </div>
      </div>

      <div class="px-stack-lg py-stack-md bg-surface-container-lowest flex justify-end">
        <button class="bg-surface-container-high text-on-surface px-stack-md py-2 rounded-lg font-label-caps text-label-caps hover:bg-surface-container-highest transition-colors" type="button" @click="closeSourceModal">
          Close
        </button>
      </div>
    </div>
  </div>

  <div v-if="isSettingsOpen" class="dialog-backdrop" @click.self="isSettingsOpen = false">
    <section class="dialog-panel dialog-panel--compact">
      <header class="dialog-header">
        <div>
          <p>Settings</p>
          <h2>Service Status</h2>
        </div>
        <button type="button" class="dialog-close" @click="isSettingsOpen = false">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <div class="settings-summary">
        <div>
          <span>Assistant</span>
          <strong>{{ assistantName || 'No assistant selected' }}</strong>
        </div>
        <div>
          <span>Knowledge Base</span>
          <strong>{{ knowledgeBaseName || 'No knowledge base selected' }}</strong>
        </div>
        <div>
          <span>Connection</span>
          <strong>{{ healthStatus }}</strong>
        </div>
      </div>

      <p v-if="configErrorMessage" class="dialog-error">{{ configErrorMessage }}</p>
      <div class="dialog-actions">
        <button type="button" class="dialog-action" :disabled="isLoadingConfig" @click="loadConfig">
          Reload
        </button>
        <button type="button" class="dialog-action dialog-action--primary" @click="checkHealth">
          Check Health
        </button>
      </div>
    </section>
  </div>
</template>
