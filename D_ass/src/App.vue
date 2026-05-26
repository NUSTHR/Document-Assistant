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
import { useAuthFlow } from './composables/useAuthFlow'
import { useChatPresentation } from './composables/useChatPresentation'
import { useChatSessions } from './composables/useChatSessions'
import { useChatUiState } from './composables/useChatUiState'
import { useRagWorkspace } from './composables/useRagWorkspace'
import { useRagflowConfiguration, type ModelOption } from './composables/useRagflowConfiguration'
import { useSessionCitationSnapshots } from './composables/useSessionCitationSnapshots'
import { useSourceReferences } from './composables/useSourceReferences'
import {
  getRagflowConfig,
} from './lib/integration-api'
import {
  createEmptyAssistantTuningDraft,
  toAssistantTuningDraft,
} from './lib/assistant-config'
import {
  resolveActiveCitationMessageId,
} from './lib/citation-state'
import { isUnavailableChatError } from './lib/ragflow-chat-state'
import {
  isDraftSessionId,
} from './lib/session-list'
import type {
  AssistantTuningDraft,
  UpdateRagflowChatConfigDraftPayload,
} from './types/integration'
import type { SessionItem } from './types/chat'

const PROFILE_IMAGE_URL =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDbV0EIMb7_6jlpqgIBumGrr4GpUZE_0i0TppiJtIlLBwFrjo0u4wZbHFbJ_l3rvQuplzUJrjKfzp8Kb1FHpN4PfzAGspFlJSpsMIfYkez0HKBF-gDKLpZ-ppeBKaMJLWLLx_FGh52AHmlO4dpd1CXeshfz5fL2kWbvd8DmN43MRd3n43iy24RRc8MdOlUsQRi2MBMyO6Edf5YBtQ2FRmUBGy7hBpRVIfOA1IbQQM7jTNTgq-iD9Ny8I1VdSoeh4GExy8w8uT_9_Jh2'

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
const isKnowledgeOpen = ref<boolean>(false)
const isSettingsOpen = ref<boolean>(false)
const isApplyingConfigSelection = ref<boolean>(false)
const isRecoveringChatSelection = ref<boolean>(false)
const assistantTuningDraft = ref<AssistantTuningDraft>(createEmptyAssistantTuningDraft())
const {
  chatScrollElement,
  copyAnswer,
  flashedActionKey,
  openThoughtIds,
  toggleThought,
} = useChatUiState()

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

const {
  authConfig,
  authEmail,
  authErrorMessage,
  authMode,
  authNickname,
  authPassword,
  authSubmitLabel,
  authTitle,
  authUser,
  canSubmitAuth,
  initializeAuth,
  isAuthenticated,
  signOut,
  submitAuth,
  switchAuthMode,
  profileName,
} = useAuthFlow({
  onExistingSessionLoaded: loadConfig,
  onSignedIn: async () => {
    resetWorkspaceForAuthChange()
    await loadConfig()
    void checkHealth()
  },
  onSignedOut: resetWorkspaceForAuthChange,
})

const profileSubtitle = computed(() => {
  return authUser.value?.email || healthStatus.value
})

const chatSessions = useChatSessions(selectedChatId, sessionId, sessionName, {
  onSessionLoaded: (activeSession) => {
    activeCitationMessageId.value = resolveActiveCitationMessageId(
      activeSession,
      activeCitationMessageId.value,
    )
  },
  onSessionLoadError: async (errorMessage, chatId) => {
    if (chatId === selectedChatId.value && isUnavailableChatError(errorMessage)) {
      await recoverUnavailableChatSelection(errorMessage)
      return true
    }

    return false
  },
  removeSessionCitationSnapshot,
  resetCitationUi: (options) => resetCitationUi(options),
  resetChat,
})

const {
  closeSessionMenu,
  closeSessionDialog,
  confirmSessionDialog,
  createNewChat: createNewChatSession,
  draftSession,
  isLoadingSessions,
  isSessionActionBusy,
  loadSessions: loadChatSessionsFromRagflow,
  openSessionMenuId,
  pendingSessionItem,
  pendingSessionName,
  removeSession,
  renameSession,
  resetSessions,
  selectSession: selectChatSession,
  sessionDialogMode,
  sessionDialogSubtitle,
  sessionDialogTitle,
  sessionErrorMessage,
  sessionItems,
  syncActiveSessionSummary: syncChatSessionSummary,
  togglePinnedSession,
  toggleSessionMenu,
} = chatSessions

const selectedSession = computed(() => chatSessions.selectedSession.value)

const {
  answerIsError,
  displayedTranscriptMessages,
  findMatchingTranscriptMessage,
  isLiveThinkingOnly,
  liveAnswerIsStreaming,
  liveAnswerPresentation,
  liveAnswerSegments,
  sessionContainsExchange,
  shouldShowAnswer,
  transcriptMessages,
} = useChatPresentation({
  chatErrorMessage,
  isStreamingChat,
  selectedSession,
  streamedAnswer,
  submittedQuestion,
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

  resetSessions()
  sessionId.value = ''
  sessionName.value = ''
  resetCitationUi({ closePanel: true })
  resetChat()
  await loadChatSessions(nextChatId)
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

function resetWorkspaceForAuthChange(): void {
  isKnowledgeOpen.value = false
  isSettingsOpen.value = false
  citationsOpen.value = false
  resetSessions()
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

function clearUnavailableChatState(): void {
  assistantChatId.value = ''
  assistantName.value = ''
  resetSessions()
  sessionId.value = ''
  sessionName.value = ''
  selectedDatasetIds.value = []
  configLlmId.value = ''
  assistantTuningDraft.value = createEmptyAssistantTuningDraft()
  resetCitationUi({ closePanel: true })
  resetChat()
}

function createNewChat(): void {
  citationsOpen.value = false
  if (createNewChatSession()) {
    configErrorMessage.value = ''
  } else {
    configErrorMessage.value = sessionErrorMessage.value
  }
}

function selectSession(item: SessionItem): void {
  selectChatSession(item)
  void scrollChatToBottom()
}

async function loadChatSessions(
  chatId: string,
  options: { recoverUnavailableChat?: boolean } = {},
): Promise<void> {
  configErrorMessage.value = ''
  await loadChatSessionsFromRagflow(chatId, options)
  if (sessionErrorMessage.value) {
    configErrorMessage.value = sessionErrorMessage.value
  }
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
    await loadChatSessions(selectedChatId.value)
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
  syncChatSessionSummary({
    bizChatId: selectedChatId.value,
    bizSessionId: sessionId.value,
    name: sessionName.value || submittedQuestion.value,
  })
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
    await loadChatSessions(chatId, options)
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
      @close-session-menu="closeSessionMenu"
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
    <main class="app-main flex-1 md:ml-[260px] h-full min-h-0 min-w-0 flex flex-col md:flex-row overflow-hidden pb-16 md:pb-0">
      <!-- Middle Column: Source Citations (40%) -->
      <section v-show="citationsOpen" class="citation-pane w-full md:w-[40%] bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden transition-all min-h-0 min-w-0">
        <header class="pane-header p-stack-md border-b border-outline-variant flex justify-between items-center bg-surface">
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
      <section class="chat-pane flex-1 bg-surface flex flex-col overflow-hidden relative min-h-0 min-w-0">
        <header class="chat-pane-header p-stack-md border-b border-outline-variant flex items-center justify-between bg-surface/80 backdrop-blur-md sticky top-0 z-10">
          <div class="chat-heading flex items-center gap-4">
            <button class="text-on-surface-variant hover:text-primary transition-colors focus:outline-none p-1.5 -ml-1.5 rounded-lg hover:bg-surface-container" title="Toggle Citations" type="button" @click="citationsOpen = !citationsOpen">
              <span class="material-symbols-outlined">{{ citationsOpen ? 'left_panel_close' : 'left_panel_open' }}</span>
            </button>
            <div class="bg-secondary-container text-secondary p-2 rounded-lg">
              <span class="material-symbols-outlined" data-icon="auto_awesome" data-weight="fill" style="font-variation-settings: 'FILL' 1;">auto_awesome</span>
            </div>
            <div class="min-w-0">
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

