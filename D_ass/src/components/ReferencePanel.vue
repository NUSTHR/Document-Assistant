<script setup lang="ts">
import type { ReferenceCard } from '../types/workspace'

defineProps<{
  activeReferenceNumber: number | null
  referenceCards: ReferenceCard[]
}>()

const emit = defineEmits<{
  (event: 'select-reference', referenceNumber: number): void
}>()
</script>

<template>
  <article class="workspace-panel reference-panel">
    <div class="workspace-panel-header">
      <div>
        <p class="workspace-section-label">Citations</p>
        <h2 class="workspace-section-title">引用片段</h2>
      </div>
      <span class="workspace-badge workspace-badge--subtle">
        {{ referenceCards.length }} 条
      </span>
    </div>

    <div v-if="referenceCards.length === 0" class="workspace-empty">
      当前回答暂无引用片段。
    </div>

    <div v-else class="reference-list">
      <button
        v-for="reference in referenceCards"
        :key="reference.key"
        type="button"
        class="reference-card"
        :class="{
          'reference-card--active':
            reference.referenceNumber === activeReferenceNumber,
        }"
        @click="emit('select-reference', reference.referenceNumber)"
        >
        <span class="reference-card__index">[^{{ reference.referenceNumber }}]</span>
        <strong>{{ reference.bizFileName }}</strong>
        <span class="reference-card__score">score {{ reference.similarityLabel }}</span>
        <p class="reference-card__meta">biz_file_id={{ reference.bizFileId }}</p>
        <p class="reference-card__content">{{ reference.chunkContent }}</p>
      </button>
    </div>
  </article>
</template>

<style scoped>
.reference-list {
  display: grid;
  gap: 8px;
}

.reference-card {
  position: relative;
  display: grid;
  gap: 6px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  color: var(--foreground);
  padding: 12px;
}

.reference-card:hover:not(:disabled) {
  border-color: var(--ring);
  transform: none;
}

.reference-card--active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}

.reference-card__index {
  color: var(--primary);
  font-size: 0.82rem;
  font-weight: 700;
}

.reference-card strong {
  padding-right: 74px;
  overflow-wrap: anywhere;
  font-size: 0.94rem;
}

.reference-card__score {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--muted-foreground);
  font-size: 0.78rem;
}

.reference-card__meta {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.reference-card__content {
  margin: 2px 0 0;
  color: var(--foreground);
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 0.88rem;
}
</style>
