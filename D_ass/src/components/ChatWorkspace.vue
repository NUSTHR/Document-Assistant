<script setup lang="ts">
import { computed } from 'vue'

import AnswerMessage from './AnswerMessage.vue'
import type { AnswerSegment } from '../types/workspace'

const props = defineProps<{
  activeReferenceNumber: number | null
  answerSegments: AnswerSegment[]
  answerStatus: string
  assistantName: string
  canSubmit: boolean
  chatErrorMessage: string
  hasAnswer: boolean
  isStreaming: boolean
  question: string
  sessionName: string
}>()

const emit = defineEmits<{
  (event: 'cancel-chat'): void
  (event: 'select-reference', referenceNumber: number): void
  (event: 'submit-chat'): void
  (event: 'update:assistant-name', value: string): void
  (event: 'update:question', value: string): void
  (event: 'update:session-name', value: string): void
}>()

const assistantNameModel = computed<string>({
  get: () => props.assistantName,
  set: (value) => emit('update:assistant-name', value),
})

const sessionNameModel = computed<string>({
  get: () => props.sessionName,
  set: (value) => emit('update:session-name', value),
})

const questionModel = computed<string>({
  get: () => props.question,
  set: (value) => emit('update:question', value),
})

const questionLength = computed<number>(() => props.question.trim().length)
</script>

<template>
  <section class="workspace-column workspace-column--chat">
    <article class="workspace-panel search-panel">
      <div class="workspace-panel-header search-panel__header">
        <div>
          <p class="workspace-section-label">RAG Search</p>
          <h2 class="workspace-section-title">Ask across your context</h2>
        </div>
        <span class="workspace-badge" :class="{ 'workspace-badge--live': isStreaming }">
          {{ answerStatus }}
        </span>
      </div>

      <div class="search-panel__meta">
        <label class="workspace-field">
          <span class="workspace-label">助手名称</span>
          <input
            v-model.trim="assistantNameModel"
            type="text"
            placeholder="例如：finance-assistant"
          />
        </label>

        <label class="workspace-field">
          <span class="workspace-label">会话名称</span>
          <input v-model.trim="sessionNameModel" type="text" placeholder="例如：demo-session" />
        </label>
      </div>

      <label class="workspace-field search-box">
        <span class="workspace-label">Search query</span>
        <textarea
          v-model.trim="questionModel"
          rows="6"
          placeholder="输入你的问题，系统会从当前知识库上下文中检索并生成带引用的回答"
        />
      </label>

      <div class="search-panel__footer">
        <p class="search-panel__hint">
          {{ questionLength > 0 ? `${questionLength} 字` : '等待输入' }}
        </p>
        <div class="workspace-toolbar">
          <button
            type="button"
            class="workspace-button workspace-button--secondary"
            :disabled="!isStreaming"
            @click="emit('cancel-chat')"
          >
            取消
          </button>
          <button type="button" :disabled="!canSubmit" @click="emit('submit-chat')">
            {{ isStreaming ? '回答中...' : '发送问题' }}
          </button>
        </div>
      </div>
    </article>

    <AnswerMessage
      :active-reference-number="activeReferenceNumber"
      :answer-segments="answerSegments"
      :answer-status="answerStatus"
      :error-message="chatErrorMessage"
      :has-answer="hasAnswer"
      :is-streaming="isStreaming"
      @select-reference="emit('select-reference', $event)"
    />
  </section>
</template>

<style scoped>
.search-panel {
  margin-bottom: 20px;
}

.search-panel__header {
  align-items: center;
}

.search-panel__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.search-box textarea {
  min-height: 160px;
  resize: vertical;
}

.search-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 14px;
}

.search-panel__hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.88rem;
}

@media (max-width: 720px) {
  .search-panel__meta,
  .search-panel__footer {
    grid-template-columns: 1fr;
  }

  .search-panel__footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
