<script setup lang="ts">
import { computed } from 'vue'

type SessionDialogMode = 'rename' | 'delete'

export interface SessionDialogItem {
  id: string
  name: string
  isPinned: boolean
  isDraft: boolean
}

const props = defineProps<{
  isBusy: boolean
  mode: SessionDialogMode | null
  pendingSessionName: string
  sessionItem: SessionDialogItem | null
  subtitle: string
  title: string
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm'): void
  (event: 'update:pendingSessionName', value: string): void
}>()

const pendingSessionNameModel = computed<string>({
  get: () => props.pendingSessionName,
  set: (value) => emit('update:pendingSessionName', value),
})
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')">
    <section class="dialog-panel dialog-panel--compact">
      <header class="dialog-header">
        <div>
          <p>Chat Sessions</p>
          <h2>{{ title }}</h2>
        </div>
        <button type="button" class="dialog-close" @click="emit('close')">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>
      <p class="dialog-copy">{{ subtitle }}</p>

      <label v-if="mode === 'rename'" class="prompt-field">
        <span>Session Name</span>
        <input v-model.trim="pendingSessionNameModel" type="text" @keydown.enter.prevent="emit('confirm')" />
      </label>

      <div v-else class="delete-preview">
        <span class="material-symbols-outlined text-error">warning</span>
        <div>
          <strong>{{ sessionItem?.name }}</strong>
          <small>This action cannot be undone for RAGFlow-backed sessions.</small>
        </div>
      </div>

      <div class="dialog-actions">
        <button type="button" class="dialog-action" :disabled="isBusy" @click="emit('close')">
          Cancel
        </button>
        <button
          type="button"
          class="dialog-action dialog-action--primary"
          :disabled="isBusy || (mode === 'rename' && pendingSessionName.trim().length === 0)"
          @click="emit('confirm')"
        >
          {{ isBusy ? 'Working...' : (mode === 'delete' ? 'Delete' : 'Save') }}
        </button>
      </div>
    </section>
  </div>
</template>
