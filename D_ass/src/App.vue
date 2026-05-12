<script setup lang="ts">
import ChatWorkspace from './components/ChatWorkspace.vue'
import DocumentPreviewPanel from './components/DocumentPreviewPanel.vue'
import KnowledgeSidebar from './components/KnowledgeSidebar.vue'
import ReferencePanel from './components/ReferencePanel.vue'
import { useRagWorkspace } from './composables/useRagWorkspace'

const {
  activeReferenceCard,
  activeReferenceNumber,
  answerSegments,
  answerStatus,
  assistantName,
  bizFileId,
  bizFileName,
  canSubmitChat,
  canUploadFile,
  cancelChat,
  chatErrorMessage,
  checkHealth,
  currentFile,
  currentFileAssetPreview,
  currentFileDetail,
  currentFileSummary,
  fileAssetPreviewErrorMessage,
  fileDetailErrorMessage,
  fileCards,
  handleFileChange,
  handleReferenceSelection,
  hasMissingActiveReferenceSource,
  healthErrorMessage,
  healthStatus,
  isLoadingAssetPreview,
  isLoadingFiles,
  isLoadingFileDetail,
  isStreamingChat,
  isUploadingFile,
  knowledgeBaseName,
  knowledgeFilesErrorMessage,
  loadFiles,
  loadCurrentFileAssetPreview,
  pageErrorMessage,
  question,
  referenceCards,
  reloadCurrentFileDetail,
  selectKnowledgeFile,
  sessionName,
  streamedAnswer,
  submitChat,
  submitUpload,
  uploadDraftSummary,
  workspaceSummary,
} = useRagWorkspace()
</script>

<template>
  <main class="workspace-page">
    <header class="app-header">
      <div>
        <p class="workspace-section-label">Documentation Assistant</p>
        <h1 class="app-header__title">RAG Search Workspace</h1>
      </div>
      <div class="app-status-grid" aria-label="工作台状态">
        <div class="app-status-card">
          <span>Knowledge base</span>
          <strong>{{ knowledgeBaseName || '未选择' }}</strong>
        </div>
        <div class="app-status-card">
          <span>Assistant</span>
          <strong>{{ assistantName || '未设置' }}</strong>
        </div>
        <div class="app-status-card">
          <span>Session</span>
          <strong>{{ sessionName || '默认会话' }}</strong>
        </div>
        <div class="app-status-card app-status-card--accent">
          <span>Service</span>
          <strong>{{ healthStatus }}</strong>
        </div>
      </div>
    </header>

    <section class="workspace-shell">
      <KnowledgeSidebar
        :biz-file-id="bizFileId"
        :biz-file-name="bizFileName"
        :can-upload="canUploadFile"
        :current-file-summary="currentFileSummary"
        :file-cards="fileCards"
        :health-error-message="healthErrorMessage"
        :health-status="healthStatus"
        :is-loading-files="isLoadingFiles"
        :is-uploading="isUploadingFile"
        :knowledge-base-name="knowledgeBaseName"
        :knowledge-files-error-message="knowledgeFilesErrorMessage"
        :upload-draft-summary="uploadDraftSummary"
        :workspace-summary="workspaceSummary"
        @check-health="checkHealth"
        @file-change="handleFileChange"
        @load-files="loadFiles"
        @select-file="selectKnowledgeFile"
        @submit-upload="submitUpload"
        @update:biz-file-id="bizFileId = $event"
        @update:biz-file-name="bizFileName = $event"
        @update:knowledge-base-name="knowledgeBaseName = $event"
      />

      <ChatWorkspace
        :active-reference-number="activeReferenceNumber"
        :answer-segments="answerSegments"
        :answer-status="answerStatus"
        :assistant-name="assistantName"
        :can-submit="canSubmitChat"
        :chat-error-message="chatErrorMessage"
        :has-answer="streamedAnswer.length > 0"
        :is-streaming="isStreamingChat"
        :question="question"
        :session-name="sessionName"
        @cancel-chat="cancelChat"
        @select-reference="handleReferenceSelection"
        @submit-chat="submitChat"
        @update:assistant-name="assistantName = $event"
        @update:question="question = $event"
        @update:session-name="sessionName = $event"
      />

      <aside class="workspace-column workspace-column--inspector">
        <ReferencePanel
          :active-reference-number="activeReferenceNumber"
          :reference-cards="referenceCards"
          @select-reference="handleReferenceSelection"
        />
        <DocumentPreviewPanel
          :active-reference-card="activeReferenceCard"
          :current-file="currentFile"
          :current-file-asset-preview="currentFileAssetPreview"
          :current-file-detail="currentFileDetail"
          :file-asset-preview-error-message="fileAssetPreviewErrorMessage"
          :file-detail-error-message="fileDetailErrorMessage"
          :has-missing-active-reference-source="hasMissingActiveReferenceSource"
          :is-loading-asset-preview="isLoadingAssetPreview"
          :is-loading-file-detail="isLoadingFileDetail"
          @load-asset-preview="loadCurrentFileAssetPreview"
          @reload-detail="reloadCurrentFileDetail"
        />
      </aside>
    </section>

    <section v-if="pageErrorMessage" class="workspace-error">
      {{ pageErrorMessage }}
    </section>
  </main>
</template>
