<script setup lang="ts">
import type { SourceItem } from '../lib/citation-sources'

defineProps<{
  preview: string
  source: SourceItem | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
}>()
</script>

<template>
  <div
    v-if="source"
    class="fixed inset-0 z-50 flex items-center justify-center p-container-padding-mobile md:p-container-padding-desktop bg-on-background/40 backdrop-blur-sm animate-in fade-in duration-200"
    @click.self="emit('close')"
  >
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-outline-variant">
      <div class="flex items-center justify-between px-stack-md py-stack-md border-b border-outline-variant">
        <div class="flex items-center gap-3 min-w-0">
          <span class="material-symbols-outlined text-secondary" data-icon="article">article</span>
          <h2 class="font-headline-sm text-headline-sm text-primary truncate">{{ source.title }}</h2>
        </div>
        <button class="p-2 hover:bg-surface-container rounded-full transition-colors" type="button" @click="emit('close')">
          <span class="material-symbols-outlined" data-icon="close">close</span>
        </button>
      </div>

      <div class="p-stack-lg space-y-stack-md">
        <div class="flex items-center gap-gutter text-on-surface-variant pb-stack-md border-b border-outline-variant">
          <div class="flex flex-col min-w-0">
            <span class="font-label-caps text-[10px] uppercase tracking-wider">Source</span>
            <span class="font-body-md text-on-surface font-medium truncate">{{ source.sourceName }}</span>
          </div>
          <div class="w-px h-8 bg-outline-variant"></div>
          <div class="flex flex-col">
            <span class="font-label-caps text-[10px] uppercase tracking-wider">Reference</span>
            <span class="font-body-md text-on-surface font-medium">REF [{{ source.referenceNumber }}]</span>
          </div>
        </div>

        <div class="relative py-stack-sm source-modal-body custom-scrollbar">
          <div class="absolute -left-4 top-0 bottom-0 w-1 bg-secondary/30 rounded-full"></div>
          <p class="font-body-lg text-body-lg leading-relaxed text-on-surface whitespace-pre-wrap">{{ preview }}</p>
        </div>
      </div>

      <div class="px-stack-lg py-stack-md bg-surface-container-lowest flex justify-end">
        <button
          class="bg-surface-container-high text-on-surface px-stack-md py-2 rounded-lg font-label-caps text-label-caps hover:bg-surface-container-highest transition-colors"
          type="button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
