<script setup lang="ts">
defineProps<{
  assistantName: string
  configErrorMessage: string
  healthStatus: string
  isLoadingConfig: boolean
  knowledgeBaseName: string
  profileName: string
  profileSubtitle: string
}>()

const emit = defineEmits<{
  (event: 'check-health'): void
  (event: 'close'): void
  (event: 'reload'): void
  (event: 'sign-out'): void
}>()
</script>

<template>
  <div class="dialog-backdrop" @click.self="emit('close')">
    <section class="dialog-panel dialog-panel--compact">
      <header class="dialog-header">
        <div>
          <p>Settings</p>
          <h2>Service Status</h2>
        </div>
        <button type="button" class="dialog-close" @click="emit('close')">
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <div class="settings-summary">
        <div>
          <span>Signed In</span>
          <strong>{{ profileName }}</strong>
        </div>
        <div>
          <span>Email</span>
          <strong>{{ profileSubtitle }}</strong>
        </div>
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
        <button type="button" class="dialog-action" :disabled="isLoadingConfig" @click="emit('reload')">
          Reload
        </button>
        <button type="button" class="dialog-action dialog-action--primary" @click="emit('check-health')">
          Check Health
        </button>
        <button type="button" class="dialog-action" @click="emit('sign-out')">
          Sign Out
        </button>
      </div>
    </section>
  </div>
</template>
