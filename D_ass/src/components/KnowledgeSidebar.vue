<script setup lang="ts">
import { computed } from 'vue'

import type {
  CurrentFileSummary,
  KnowledgeFileCard,
  KnowledgeWorkspaceSummary,
  UploadDraftSummary,
} from '../types/workspace'

const props = defineProps<{
  bizFileId: string
  bizFileName: string
  canUpload: boolean
  currentFileSummary: CurrentFileSummary | null
  healthErrorMessage: string
  fileCards: KnowledgeFileCard[]
  healthStatus: string
  isLoadingFiles: boolean
  isUploading: boolean
  knowledgeBaseName: string
  knowledgeFilesErrorMessage: string
  uploadDraftSummary: UploadDraftSummary
  workspaceSummary: KnowledgeWorkspaceSummary
}>()

const emit = defineEmits<{
  (event: 'check-health'): void
  (event: 'file-change', payload: Event): void
  (event: 'load-files'): void
  (event: 'select-file', bizFileId: string): void
  (event: 'submit-upload'): void
  (event: 'update:biz-file-id', value: string): void
  (event: 'update:biz-file-name', value: string): void
  (event: 'update:knowledge-base-name', value: string): void
}>()

const knowledgeBaseNameModel = computed<string>({
  get: () => props.knowledgeBaseName,
  set: (value) => emit('update:knowledge-base-name', value),
})

const bizFileIdModel = computed<string>({
  get: () => props.bizFileId,
  set: (value) => emit('update:biz-file-id', value),
})

const bizFileNameModel = computed<string>({
  get: () => props.bizFileName,
  set: (value) => emit('update:biz-file-name', value),
})
</script>

<template>
  <aside class="workspace-column workspace-column--sidebar">
    <article class="workspace-panel context-panel">
      <div class="workspace-panel-header">
        <div>
          <p class="workspace-section-label">Context sources</p>
          <h2 class="workspace-section-title">知识库上下文</h2>
        </div>
        <button
          type="button"
          class="workspace-button workspace-button--secondary"
          @click="emit('check-health')"
        >
          检测
        </button>
      </div>

      <label class="workspace-field">
        <span class="workspace-label">知识库名称</span>
        <input
          v-model.trim="knowledgeBaseNameModel"
          type="text"
          placeholder="例如：finance-kb"
        />
      </label>

      <div class="context-stats" aria-label="上下文统计">
        <div>
          <span>文件</span>
          <strong>{{ workspaceSummary.totalFiles }}</strong>
        </div>
        <div>
          <span>引用</span>
          <strong>{{ workspaceSummary.referencedFiles }}</strong>
        </div>
        <div>
          <span>服务</span>
          <strong>{{ healthStatus }}</strong>
        </div>
      </div>

      <p v-if="healthErrorMessage" class="panel-error-message">
        {{ healthErrorMessage }}
      </p>
    </article>

    <article class="workspace-panel source-list-panel">
      <div class="workspace-panel-header">
        <div>
          <p class="workspace-section-label">Sources</p>
          <h2 class="workspace-section-title">已上传文档</h2>
        </div>
        <button
          type="button"
          class="workspace-button workspace-button--secondary"
          :disabled="isLoadingFiles"
          @click="emit('load-files')"
        >
          {{ isLoadingFiles ? '同步中...' : '刷新' }}
        </button>
      </div>

      <p v-if="knowledgeFilesErrorMessage" class="panel-error-message">
        {{ knowledgeFilesErrorMessage }}
      </p>

      <div v-if="fileCards.length === 0" class="workspace-empty">
        当前知识库下暂无文档。
      </div>

      <div v-else class="knowledge-list">
        <button
          v-for="file in fileCards"
          :key="file.key"
          type="button"
          class="knowledge-card"
          :class="{
            'knowledge-card--active': file.isCurrent,
            'knowledge-card--referenced': file.isReferencedInAnswer,
            'knowledge-card--linked': file.isActiveReferenceSource,
          }"
          @click="emit('select-file', file.bizFileId)"
        >
          <span class="knowledge-card__status">{{ file.parseStatus }}</span>
          <strong>{{ file.bizFileName }}</strong>
          <span class="knowledge-card__relation">{{ file.relationLabel }}</span>
          <span class="knowledge-card__meta">biz_file_id={{ file.bizFileId }}</span>
          <span class="knowledge-card__meta">{{ file.statsLabel }}</span>
          <span v-if="file.parseMessage" class="knowledge-card__warning">
            {{ file.parseMessage }}
          </span>
        </button>
      </div>
    </article>

    <details class="workspace-panel upload-drawer">
      <summary>
        <span>
          <span class="workspace-section-label">Upload</span>
          <strong>添加知识文件</strong>
        </span>
        <span class="workspace-badge workspace-badge--subtle">
          {{ uploadDraftSummary.readinessLabel }}
        </span>
      </summary>

      <div class="upload-drawer__body">
        <label class="workspace-field">
          <span class="workspace-label">业务文件 ID</span>
          <input v-model.trim="bizFileIdModel" type="text" placeholder="例如：FILE-10293" />
        </label>

        <label class="workspace-field">
          <span class="workspace-label">业务文件名</span>
          <input
            v-model.trim="bizFileNameModel"
            type="text"
            placeholder="例如：2023年度报表.pdf"
          />
        </label>

        <label class="workspace-field">
          <span class="workspace-label">选择文件</span>
          <input type="file" @change="emit('file-change', $event)" />
        </label>

        <div class="upload-draft">
          <span class="workspace-label">当前待上传文件</span>
          <strong>{{ uploadDraftSummary.selectedFileName }}</strong>
          <p>{{ uploadDraftSummary.helperText }}</p>
        </div>

        <button type="button" class="upload-drawer__submit" :disabled="!canUpload" @click="emit('submit-upload')">
          {{ isUploading ? '上传中...' : '上传并解析' }}
        </button>
      </div>
    </details>

    <article class="workspace-panel current-source-panel">
      <div class="workspace-panel-header">
        <div>
          <p class="workspace-section-label">Current file</p>
          <h2 class="workspace-section-title">选中文档</h2>
        </div>
      </div>

      <div v-if="!currentFileSummary" class="workspace-empty">
        尚未选择文档。
      </div>

      <div v-else class="current-file-summary">
        <strong>{{ currentFileSummary.title }}</strong>
        <span>{{ currentFileSummary.relationLabel }}</span>
        <p>biz_file_id={{ currentFileSummary.bizFileId }}</p>
        <p>
          knowledge_base={{ currentFileSummary.knowledgeBaseName }} ·
          {{ currentFileSummary.parseStatus }}
        </p>
        <p>{{ currentFileSummary.statsLabel }} · {{ currentFileSummary.lastUpdatedLabel }}</p>
        <p v-if="currentFileSummary.parseMessage" class="current-file-summary__warning">
          {{ currentFileSummary.parseMessage }}
        </p>
      </div>
    </article>
  </aside>
</template>

<style scoped>
.context-panel,
.source-list-panel,
.current-source-panel {
  min-width: 0;
}

.context-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.context-stats div {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  background: var(--muted);
}

.context-stats span {
  display: block;
  color: var(--muted-foreground);
  font-size: 0.76rem;
}

.context-stats strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--foreground);
  font-size: 0.95rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.knowledge-list {
  display: grid;
  gap: 8px;
}

.knowledge-card {
  position: relative;
  display: grid;
  width: 100%;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--card);
  color: var(--foreground);
  text-align: left;
}

.knowledge-card:hover:not(:disabled) {
  border-color: var(--ring);
  transform: none;
}

.knowledge-card--active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.knowledge-card--referenced {
  background: #f8fafc;
}

.knowledge-card--linked {
  border-color: #0f766e;
}

.knowledge-card__status {
  position: absolute;
  top: 10px;
  right: 10px;
  color: var(--muted-foreground);
  font-size: 0.76rem;
}

.knowledge-card strong {
  max-width: calc(100% - 72px);
  overflow-wrap: anywhere;
  font-size: 0.94rem;
}

.knowledge-card__relation,
.knowledge-card__meta {
  color: var(--muted-foreground);
  font-size: 0.82rem;
  line-height: 1.45;
}

.knowledge-card__warning {
  color: var(--warning-foreground);
  font-size: 0.82rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.upload-drawer summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  list-style: none;
}

.upload-drawer summary::-webkit-details-marker {
  display: none;
}

.upload-drawer summary strong {
  display: block;
  color: var(--foreground);
  font-size: 1rem;
}

.upload-drawer__body {
  margin-top: 18px;
}

.upload-draft {
  margin-top: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--muted);
}

.upload-draft strong {
  display: block;
  color: var(--foreground);
  overflow-wrap: anywhere;
}

.upload-draft p {
  margin: 8px 0 0;
  color: var(--muted-foreground);
  font-size: 0.88rem;
  line-height: 1.55;
}

.upload-drawer__submit {
  width: 100%;
  margin-top: 14px;
}

.current-file-summary {
  display: grid;
  gap: 8px;
}

.current-file-summary strong {
  color: var(--foreground);
  overflow-wrap: anywhere;
}

.current-file-summary span {
  color: var(--primary);
  font-size: 0.86rem;
}

.current-file-summary p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.86rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.current-file-summary__warning {
  color: var(--warning-foreground) !important;
  white-space: pre-wrap;
}

.panel-error-message {
  margin: 12px 0 0;
  color: var(--destructive);
  font-size: 0.88rem;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
