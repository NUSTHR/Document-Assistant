<script setup lang="ts">
const emit = defineEmits<{
  (event: 'open-knowledge'): void
  (event: 'open-settings'): void
}>()
</script>

<template>
  <nav class="flex justify-around items-center h-16 w-full z-50 bg-surface border-t border-outline-variant fixed bottom-0 md:hidden shadow-lg">
    <div class="flex flex-col items-center gap-1 text-secondary scale-110">
      <span class="material-symbols-outlined" data-icon="chat">chat</span>
      <span class="font-label-caps text-[10px]">Chat</span>
    </div>
    <button class="flex flex-col items-center gap-1 text-on-surface-variant" type="button" @click="emit('open-knowledge')">
      <span class="material-symbols-outlined" data-icon="tune">tune</span>
      <span class="font-label-caps text-[10px]">Agent</span>
    </button>
    <button class="flex flex-col items-center gap-1 text-on-surface-variant" type="button" @click="emit('open-settings')">
      <span class="material-symbols-outlined" data-icon="settings">settings</span>
      <span class="font-label-caps text-[10px]">Settings</span>
    </button>
  </nav>
</template>
