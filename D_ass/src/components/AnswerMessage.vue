<script setup lang="ts">
import type { AnswerSegment } from '../types/workspace'

const props = defineProps<{
  activeReferenceNumber: number | null
  answerSegments: AnswerSegment[]
  answerStatus: string
  errorMessage: string
  hasAnswer: boolean
  isStreaming: boolean
}>()

const emit = defineEmits<{
  (event: 'select-reference', referenceNumber: number): void
}>()

function handleReferenceClick(referenceNumber: number | null): void {
  if (referenceNumber === null) {
    return
  }

  emit('select-reference', referenceNumber)
}
</script>

<template>
  <article class="workspace-panel answer-message">
    <div class="workspace-panel-header">
      <div>
        <p class="workspace-section-label">Answer</p>
        <h2 class="workspace-section-title">回答结果</h2>
      </div>
      <span class="workspace-badge" :class="{ 'workspace-badge--live': isStreaming }">
        {{ answerStatus }}
      </span>
    </div>

    <p v-if="errorMessage" class="answer-message__error">
      {{ errorMessage }}
    </p>

    <div v-else-if="!hasAnswer" class="answer-message__empty">
      <strong>Ready for retrieval</strong>
      <span>答案会在这里生成。</span>
    </div>

    <p v-else class="answer-message__content">
      <template v-for="segment in props.answerSegments" :key="segment.key">
        <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
        <button
          v-else
          type="button"
          class="answer-message__footnote"
          :class="{
            'answer-message__footnote--active':
              segment.referenceNumber === activeReferenceNumber,
          }"
          @click="handleReferenceClick(segment.referenceNumber)"
        >
          {{ segment.text }}
        </button>
      </template>
    </p>
  </article>
</template>

<style scoped>
.answer-message {
  min-height: 360px;
}

.answer-message__content {
  margin: 0;
  white-space: pre-wrap;
  color: var(--foreground);
  font-size: 1rem;
  line-height: 1.8;
}

.answer-message__empty {
  display: grid;
  min-height: 220px;
  align-content: center;
  justify-items: center;
  gap: 8px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  text-align: center;
}

.answer-message__empty strong {
  color: var(--foreground);
  font-size: 1rem;
}

.answer-message__footnote {
  display: inline-flex;
  align-items: center;
  margin: 0 0.18rem;
  padding: 0.06rem 0.42rem;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
  border: 1px solid rgba(37, 99, 235, 0.24);
  font-size: 0.88em;
}

.answer-message__footnote:hover {
  background: rgba(37, 99, 235, 0.16);
  transform: none;
}

.answer-message__footnote--active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.answer-message__error {
  margin: 0.8rem 0 0;
  color: var(--destructive);
  font-size: 0.9rem;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
