<script setup lang="ts">
import type {
  FileAssetPreviewState,
  FileDetailPanelState,
  KnowledgeFileItem,
  ReferenceCard,
} from '../types/workspace'

defineProps<{
  activeReferenceCard: ReferenceCard | null
  currentFile: KnowledgeFileItem | null
  currentFileAssetPreview: FileAssetPreviewState | null
  currentFileDetail: FileDetailPanelState | null
  fileAssetPreviewErrorMessage: string
  fileDetailErrorMessage: string
  hasMissingActiveReferenceSource: boolean
  isLoadingAssetPreview: boolean
  isLoadingFileDetail: boolean
}>()

const emit = defineEmits<{
  (event: 'load-asset-preview'): void
  (event: 'reload-detail'): void
}>()

const PREVIEW_TEXT_LIMIT = 400

function truncatePreviewText(value: string): string {
  const normalizedValue = value.replace(/\s+/g, ' ').trim()
  if (normalizedValue.length <= PREVIEW_TEXT_LIMIT) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, PREVIEW_TEXT_LIMIT).trim()}...`
}
</script>

<template>
  <article class="workspace-panel source-inspector">
    <div class="workspace-panel-header">
      <div>
        <p class="workspace-section-label">Source inspector</p>
        <h2 class="workspace-section-title">文档核对</h2>
      </div>
      <div class="workspace-toolbar">
        <button
          type="button"
          class="workspace-button workspace-button--secondary"
          :disabled="!currentFile || isLoadingFileDetail"
          @click="emit('reload-detail')"
        >
          {{ isLoadingFileDetail ? '详情加载中...' : '刷新详情' }}
        </button>
        <button
          type="button"
          class="workspace-button workspace-button--secondary"
          :disabled="!currentFile || isLoadingAssetPreview"
          @click="emit('load-asset-preview')"
        >
          {{ isLoadingAssetPreview ? '原文加载中...' : '加载原文' }}
        </button>
      </div>
    </div>

    <div v-if="!activeReferenceCard && !currentFile" class="workspace-empty">
      尚未选择文档或引用。
    </div>

    <template v-else>
      <div v-if="currentFile" class="preview-block">
        <p class="workspace-label">Selected source</p>
        <strong class="preview-block__title">{{ currentFile.bizFileName }}</strong>
        <div class="preview-block__meta">
          <span>biz_file_id={{ currentFile.bizFileId }}</span>
          <span>{{ currentFile.parseStatus }}</span>
        </div>
        <p class="preview-block__meta">
          knowledge_base={{ currentFile.knowledgeBaseName }} · chunks={{ currentFile.chunkCount }} ·
          tokens={{ currentFile.tokenCount }}
        </p>
        <p v-if="currentFile.parseMessage" class="preview-warning preview-warning--embedded">
          {{ currentFile.parseMessage }}
        </p>
      </div>

      <div v-if="activeReferenceCard" class="preview-block preview-block--highlight">
        <p class="workspace-label">Active citation</p>
        <strong class="preview-block__title">
          [^{{ activeReferenceCard.referenceNumber }}] {{ activeReferenceCard.bizFileName }}
        </strong>
        <div class="preview-block__meta">
          <span>biz_file_id={{ activeReferenceCard.bizFileId }}</span>
          <span>score {{ activeReferenceCard.similarityLabel }}</span>
        </div>
        <p class="preview-block__content">{{ truncatePreviewText(activeReferenceCard.chunkContent) }}</p>
      </div>

      <div v-if="isLoadingAssetPreview" class="preview-loading">
        正在加载原文内容...
      </div>
      <div v-else-if="fileAssetPreviewErrorMessage" class="preview-warning">
        {{ fileAssetPreviewErrorMessage }}
      </div>

      <div v-else-if="currentFileAssetPreview" class="preview-block">
        <p class="workspace-label">Original preview</p>
        <strong class="preview-block__title">{{ currentFileAssetPreview.fileName }}</strong>
        <div class="preview-block__meta">
          <span>{{ currentFileAssetPreview.mediaType }}</span>
          <span>{{ currentFileAssetPreview.helperText }}</span>
        </div>

        <div class="preview-actions">
          <a
            v-if="currentFileAssetPreview.objectUrl"
            class="workspace-button"
            :href="currentFileAssetPreview.objectUrl"
            :download="currentFileAssetPreview.fileName"
            target="_blank"
            rel="noreferrer"
          >
            打开/下载原文
          </a>
        </div>

        <iframe
          v-if="currentFileAssetPreview.mode === 'pdf' && currentFileAssetPreview.objectUrl"
          class="asset-preview-frame"
          :src="currentFileAssetPreview.objectUrl"
          title="PDF 原文预览"
        />

        <img
          v-else-if="currentFileAssetPreview.mode === 'image' && currentFileAssetPreview.objectUrl"
          class="asset-preview-image"
          :src="currentFileAssetPreview.objectUrl"
          :alt="currentFileAssetPreview.fileName"
        />

        <div v-else-if="currentFileAssetPreview.mode === 'text'" class="asset-preview-text">
          <pre>{{ truncatePreviewText(currentFileAssetPreview.textContent) }}</pre>
          <p v-if="currentFileAssetPreview.isTextTruncated" class="preview-block__meta">
            文本预览已截断，仅展示前 200 KB 内容。
          </p>
        </div>

        <div v-else class="preview-warning">
          当前文件格式不适合在浏览器内直接预览，请使用上方入口打开或下载原文。
        </div>
      </div>

      <div v-if="isLoadingFileDetail" class="preview-loading">
        正在加载当前文件的 chunk 预览...
      </div>
      <div v-else-if="fileDetailErrorMessage" class="preview-warning">
        {{ fileDetailErrorMessage }}
      </div>

      <div
        v-else-if="currentFileDetail"
        class="preview-block"
      >
        <p class="workspace-label">文件详情预览</p>
        <strong class="preview-block__title">{{ currentFileDetail.title }}</strong>
        <div class="preview-block__meta">
          <span>biz_file_id={{ currentFileDetail.bizFileId }}</span>
          <span>{{ currentFileDetail.parseStatus }}</span>
        </div>
        <p class="preview-block__meta">
          knowledge_base={{ currentFileDetail.knowledgeBaseName }} · {{ currentFileDetail.statsLabel }}
        </p>
        <p class="preview-block__meta">{{ currentFileDetail.helperText }}</p>
        <p v-if="currentFileDetail.parseMessage" class="preview-warning preview-warning--embedded">
          {{ currentFileDetail.parseMessage }}
        </p>

        <div v-if="currentFileDetail.chunks.length === 0" class="workspace-empty preview-empty">
          当前文件暂无可展示的 chunk 预览。
        </div>

        <div v-else class="preview-chunks">
          <article
            v-for="chunk in currentFileDetail.chunks"
            :key="chunk.key"
            class="preview-chunk-card"
            :class="{ 'preview-chunk-card--matched': chunk.isMatchedToActiveReference }"
          >
            <div class="preview-chunk-card__header">
              <strong>{{ chunk.previewLabel }}</strong>
              <span v-if="chunk.isMatchedToActiveReference">匹配当前引用</span>
            </div>
            <p class="preview-chunk-card__content">{{ truncatePreviewText(chunk.content) }}</p>
          </article>
        </div>
      </div>

      <div v-if="hasMissingActiveReferenceSource" class="preview-warning">
        当前激活引用对应的文件还不在左侧文件工作区中。这通常意味着该引用来自此前已入库但当前前端会话内尚未上传记录到工作区的文件。
      </div>
    </template>
  </article>
</template>

<style scoped>
.preview-block + .preview-block {
  margin-top: 12px;
}

.preview-block {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  background: var(--card);
}

.preview-block--highlight {
  border-color: #0f766e;
  background: #f0fdfa;
}

.preview-block__title {
  display: block;
  color: var(--foreground);
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.preview-block__meta {
  margin: 0.65rem 0 0;
  color: var(--muted-foreground);
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}

.preview-block__content {
  margin: 0.85rem 0 0;
  color: var(--foreground);
  white-space: pre-wrap;
  line-height: 1.65;
}

.preview-warning {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid var(--warning-border);
  border-radius: var(--radius);
  background: var(--warning);
  color: var(--warning-foreground);
  font-size: 0.9rem;
  line-height: 1.65;
}

.preview-warning--embedded {
  margin-bottom: 0;
  white-space: pre-wrap;
}

.preview-loading {
  margin-top: 14px;
  color: var(--primary);
  font-size: 0.92rem;
}

.preview-empty {
  margin-top: 14px;
}

.preview-chunks {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.preview-chunk-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--muted);
}

.preview-chunk-card--matched {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.preview-chunk-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--foreground);
  font-size: 0.88rem;
}

.preview-chunk-card__content {
  margin: 0.85rem 0 0;
  color: var(--foreground);
  white-space: pre-wrap;
  line-height: 1.65;
  font-size: 0.92rem;
}

.preview-actions {
  margin-top: 14px;
}

.asset-preview-frame {
  margin-top: 14px;
  width: 100%;
  min-height: 420px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
}

.asset-preview-image {
  display: block;
  margin-top: 14px;
  max-width: 100%;
  border-radius: var(--radius);
}

.asset-preview-text {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--muted);
}

.asset-preview-text pre {
  margin: 0;
  color: var(--foreground);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.65;
  font-size: 0.92rem;
}
</style>
