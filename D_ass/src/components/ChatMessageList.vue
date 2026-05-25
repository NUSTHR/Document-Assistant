<script setup lang="ts">
import type { ChatReference } from '../types/integration'
import type { AnswerSegment } from '../types/workspace'

export interface TranscriptMessageView {
  id: string
  role: 'user' | 'assistant'
  content: string
  answerContent: string
  thoughtContent: string
  hasThought: boolean
  references: ChatReference[]
  referenceNumbers: number[]
  citedReferenceNumbers: number[]
  answerSegments: AnswerSegment[]
}

defineProps<{
  answerIsError: boolean
  chatErrorMessage: string
  displayedTranscriptMessages: TranscriptMessageView[]
  flashedActionKey: string
  isLiveThinkingOnly: boolean
  isStreamingChat: boolean
  liveAnswerIsStreaming: boolean
  liveAnswerPresentation: {
    answer: string
    thought: string
    hasThought: boolean
  }
  liveAnswerSegments: AnswerSegment[]
  openThoughtIds: string[]
  referenceCount: number
  shouldShowAnswer: boolean
  submittedQuestion: string
  streamedAnswer: string
}>()

const emit = defineEmits<{
  (event: 'copy-answer', content: string): void
  (event: 'open-source-reference', referenceNumber: number | null, options?: { messageId?: string }): void
  (event: 'toggle-thought', messageId: string): void
}>()

function isThoughtOpen(openThoughtIds: string[], messageId: string): boolean {
  return openThoughtIds.includes(messageId)
}
</script>

<template>
  <template v-for="message in displayedTranscriptMessages" :key="message.id">
    <div v-if="message.role === 'user'" class="flex justify-end">
      <div class="max-w-[85%] bg-surface-container-low border border-outline-variant rounded-2xl rounded-tr-none p-stack-md">
        <p class="font-body-md text-on-surface">{{ message.content }}</p>
      </div>
    </div>
    <div v-else class="flex justify-start items-start gap-4">
      <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
        <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
      </div>
      <div class="max-w-[90%] bg-surface-container-lowest border border-outline-variant rounded-2xl rounded-tl-none p-stack-md shadow-sm">
        <button
          v-if="message.hasThought"
          class="thought-toggle"
          type="button"
          @click="emit('toggle-thought', message.id)"
        >
          <span class="material-symbols-outlined text-[16px]">{{ isThoughtOpen(openThoughtIds, message.id) ? 'expand_less' : 'psychology' }}</span>
          {{ isThoughtOpen(openThoughtIds, message.id) ? 'Hide Thinking' : 'Show Thinking' }}
        </button>
        <div v-if="message.hasThought && isThoughtOpen(openThoughtIds, message.id)" class="thought-panel">
          {{ message.thoughtContent }}
        </div>
        <p class="font-body-lg text-on-background whitespace-pre-wrap">
          <template v-if="message.answerSegments.length > 0">
            <template v-for="segment in message.answerSegments" :key="segment.key">
              <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
              <button
                v-else
                class="citation-badge"
                type="button"
                @click="emit('open-source-reference', segment.referenceNumber, { messageId: message.id })"
              >{{ segment.referenceNumber }}</button>
            </template>
          </template>
          <span v-else>{{ message.answerContent }}</span>
        </p>
        <div class="message-actions">
          <button
            type="button"
            class="message-action"
            :class="{ 'message-action--flash': flashedActionKey === 'copy' }"
            title="Copy"
            @click="emit('copy-answer', message.content)"
          >
            <span class="material-symbols-outlined text-[15px]">content_copy</span>
          </button>
        </div>
      </div>
    </div>
  </template>

  <div v-if="submittedQuestion" class="flex justify-end">
    <div class="max-w-[85%] bg-surface-container-low border border-outline-variant rounded-2xl rounded-tr-none p-stack-md">
      <p class="font-body-md text-on-surface">{{ submittedQuestion }}</p>
    </div>
  </div>

  <div v-if="shouldShowAnswer" class="flex justify-start items-start gap-4">
    <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
      <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
    </div>
    <div
      class="max-w-[90%] bg-surface-container-lowest border border-outline-variant rounded-2xl rounded-tl-none p-stack-md shadow-sm"
      :class="{ 'live-answer-card live-answer-card--streaming': liveAnswerIsStreaming }"
    >
      <div class="space-y-4">
        <p v-if="chatErrorMessage || answerIsError" class="font-body-md text-error whitespace-pre-wrap">{{ chatErrorMessage || streamedAnswer }}</p>
        <template v-else>
          <div v-if="liveAnswerIsStreaming" class="streaming-answer-status" aria-live="polite">
            <span class="streaming-answer-status__pulse"></span>
            <span>Generating answer</span>
          </div>
          <div v-if="isLiveThinkingOnly" class="thinking-state">
            <button
              class="thought-toggle thought-toggle--streaming"
              type="button"
              @click="emit('toggle-thought', 'live-answer')"
            >
              <span class="material-symbols-outlined text-[16px]">{{ isThoughtOpen(openThoughtIds, 'live-answer') ? 'expand_less' : 'psychology' }}</span>
              Thinking...
            </button>
            <div v-if="isThoughtOpen(openThoughtIds, 'live-answer')" class="thought-panel">
              {{ liveAnswerPresentation.thought }}
            </div>
          </div>
          <template v-else>
            <button
              v-if="liveAnswerPresentation.hasThought"
              class="thought-toggle"
              type="button"
              @click="emit('toggle-thought', 'live-answer')"
            >
              <span class="material-symbols-outlined text-[16px]">{{ isThoughtOpen(openThoughtIds, 'live-answer') ? 'expand_less' : 'psychology' }}</span>
              {{ isThoughtOpen(openThoughtIds, 'live-answer') ? 'Hide Thinking' : 'Show Thinking' }}
            </button>
            <div v-if="liveAnswerPresentation.hasThought && isThoughtOpen(openThoughtIds, 'live-answer')" class="thought-panel">
              {{ liveAnswerPresentation.thought }}
            </div>
            <p class="font-body-lg text-on-background whitespace-pre-wrap">
              <template v-if="liveAnswerSegments.length > 0">
                <template v-for="segment in liveAnswerSegments" :key="segment.key">
                  <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
                  <button
                    v-else
                    class="citation-badge"
                    type="button"
                    @click="emit('open-source-reference', segment.referenceNumber)"
                  >{{ segment.referenceNumber }}</button>
                </template>
              </template>
              <span v-if="liveAnswerIsStreaming" class="streaming-caret" aria-hidden="true"></span>
            </p>
            <div v-if="!isStreamingChat" class="message-actions">
              <button
                type="button"
                class="message-action"
                :class="{ 'message-action--flash': flashedActionKey === 'copy' }"
                title="Copy"
                @click="emit('copy-answer', streamedAnswer)"
              >
                <span class="material-symbols-outlined text-[15px]">content_copy</span>
              </button>
            </div>
          </template>
        </template>
        <div v-if="referenceCount > 0" class="p-stack-sm bg-secondary-container/20 rounded-lg border border-secondary/10 flex gap-3">
          <span class="material-symbols-outlined text-secondary" data-icon="lightbulb">lightbulb</span>
          <p class="text-[13px] text-on-secondary-fixed-variant italic">Consider reviewing the cited source cards to verify the response against RAGFlow references.</p>
        </div>
      </div>
    </div>
  </div>

  <div v-if="chatErrorMessage" class="flex justify-start items-start gap-4">
    <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
      <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
    </div>
    <div class="max-w-[90%] bg-error-container border border-outline-variant rounded-2xl rounded-tl-none p-stack-md shadow-sm">
      <p class="font-body-md text-error whitespace-pre-wrap">{{ chatErrorMessage }}</p>
    </div>
  </div>

  <div v-if="isStreamingChat && !shouldShowAnswer" class="flex justify-start items-start gap-4">
    <div class="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 text-white mt-1">
      <span class="material-symbols-outlined text-[18px]" data-icon="smart_toy">smart_toy</span>
    </div>
    <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-3 flex gap-1">
      <span class="w-1.5 h-1.5 bg-secondary/40 rounded-full"></span>
      <span class="w-1.5 h-1.5 bg-secondary/70 rounded-full"></span>
      <span class="w-1.5 h-1.5 bg-secondary rounded-full"></span>
    </div>
  </div>
</template>
