<script setup lang="ts">
const emit = defineEmits<{
  (event: 'check-health'): void
  (event: 'open-settings'): void
}>()
</script>

<template>
  <header class="flex justify-between items-center w-full px-container-padding-mobile py-stack-sm bg-surface border-b border-outline-variant md:hidden">
    <div class="font-headline-sm text-headline-sm font-bold text-primary">Research Assistant</div>
    <div class="flex gap-stack-sm">
      <button
        class="material-symbols-outlined hover:bg-surface-container-low rounded-full p-2 transition-all duration-200"
        aria-label="Check health"
        data-icon="notifications"
        title="Check health"
        type="button"
        @click="emit('check-health')"
      >
        notifications
      </button>
      <button
        class="material-symbols-outlined hover:bg-surface-container-low rounded-full p-2 transition-all duration-200"
        aria-label="Open settings"
        data-icon="account_circle"
        title="Open settings"
        type="button"
        @click="emit('open-settings')"
      >
        account_circle
      </button>
    </div>
  </header>
</template>
