<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

export interface SessionItem {
  id: string
  name: string
  isPinned: boolean
  isDraft: boolean
}

const props = defineProps<{
  avatarUrl: string
  isLoadingSessions: boolean
  openSessionMenuId: string
  profileName: string
  profileSubtitle: string
  sessionId: string
  sessionItems: SessionItem[]
}>()

const emit = defineEmits<{
  (event: 'create-new-chat'): void
  (event: 'close-session-menu'): void
  (event: 'open-agent-config'): void
  (event: 'open-knowledge'): void
  (event: 'open-settings'): void
  (event: 'remove-session', item: SessionItem): void
  (event: 'rename-session', item: SessionItem): void
  (event: 'select-session', item: SessionItem): void
  (event: 'sign-out'): void
  (event: 'toggle-pinned-session', item: SessionItem): void
  (event: 'toggle-session-menu', item: SessionItem): void
}>()

function isSessionMenuTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[data-session-menu-layer], [data-session-menu-trigger]') !== null
  )
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!props.openSessionMenuId || isSessionMenuTarget(event.target)) {
    return
  }

  emit('close-session-menu')
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (props.openSessionMenuId && event.key === 'Escape') {
    emit('close-session-menu')
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <aside class="app-sidebar fixed left-0 top-0 h-full z-40 py-stack-md px-stack-sm w-[260px] flex-col hidden md:flex bg-surface border-r border-outline-variant">
    <div class="sidebar-brand flex-shrink-0 mb-stack-lg px-stack-sm">
      <h1 class="font-headline-md text-headline-md font-bold text-primary">Research Assistant</h1>
      <p class="font-body-md text-body-md text-on-surface-variant">AI Knowledge Base</p>
    </div>
    <button
      class="sidebar-new-chat flex-shrink-0 mx-stack-sm mb-stack-lg bg-primary text-on-primary py-stack-sm px-stack-md rounded-lg font-label-caps text-label-caps flex items-center justify-center gap-2 active:scale-95 transition-transform"
      type="button"
      @click="emit('create-new-chat')"
    >
      <span class="material-symbols-outlined text-[18px]" data-icon="add">add</span>
      New Chat
    </button>
    <nav class="sidebar-session-nav flex-1 min-h-0 space-y-1 overflow-y-auto custom-scrollbar">
      <div class="mt-4 mb-2 px-stack-sm">
        <p class="text-[11px] font-bold text-outline uppercase tracking-wider mb-2">Chat Sessions</p>
        <div class="space-y-1">
          <div
            v-for="item in sessionItems.slice(0, 12)"
            :key="item.id"
            class="group relative flex items-center"
          >
            <a
              class="flex-1 block px-stack-sm py-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors duration-200 text-[13px] truncate"
              :class="{ 'bg-surface-container font-bold text-primary': item.id === sessionId }"
              href="#"
              @click.prevent="emit('select-session', item)"
            >
              <span v-if="item.isPinned" class="material-symbols-outlined text-[12px]">push_pin</span>
              {{ item.name }}
            </a>
            <button
              v-if="!item.isDraft"
              class="absolute right-1 group-hover:opacity-100 p-1 hover:bg-surface-container-high rounded transition-all duration-200 text-on-surface-variant hover:text-primary opacity-40"
              data-session-menu-trigger
              type="button"
              @click.stop="emit('toggle-session-menu', item)"
            >
              <span class="material-symbols-outlined text-[18px]">more_vert</span>
            </button>
            <div v-if="!item.isDraft && openSessionMenuId === item.id" class="session-menu" data-session-menu-layer>
              <button type="button" class="session-menu__item" @click.stop="emit('toggle-pinned-session', item)">
                <span class="material-symbols-outlined text-[16px]">{{ item.isPinned ? 'keep_off' : 'push_pin' }}</span>
                {{ item.isPinned ? 'Unpin' : 'Pin' }}
              </button>
              <button type="button" class="session-menu__item" @click.stop="emit('rename-session', item)">
                <span class="material-symbols-outlined text-[16px]">edit</span>
                Rename
              </button>
              <button
                type="button"
                class="session-menu__item session-menu__item--danger"
                @click.stop="emit('remove-session', item)"
              >
                <span class="material-symbols-outlined text-[16px]">delete</span>
                Delete
              </button>
            </div>
          </div>
        </div>
        <p v-if="isLoadingSessions" class="text-[11px] text-outline mt-2 px-stack-sm">Loading sessions...</p>
        <p v-else-if="sessionItems.length === 0" class="text-[11px] text-outline mt-2 px-stack-sm">No chat sessions</p>
      </div>
    </nav>
    <div class="sidebar-footer flex-shrink-0 mt-auto border-t border-outline-variant pt-stack-md space-y-1">
      <a
        class="flex items-center gap-3 px-stack-sm py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors duration-200"
        href="#"
        @click.prevent="emit('open-agent-config')"
      >
        <span class="material-symbols-outlined" data-icon="tune">tune</span>
        <span class="font-body-md">Agent Config</span>
      </a>
      <a
        class="flex items-center gap-3 px-stack-sm py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container transition-colors duration-200"
        href="#"
        @click.prevent="emit('open-settings')"
      >
        <span class="material-symbols-outlined" data-icon="settings">settings</span>
        <span class="font-body-md">Settings</span>
      </a>
      <div class="sidebar-user-card flex items-center gap-3 px-stack-sm py-4">
        <img class="w-8 h-8 rounded-full border border-outline-variant" data-alt="RAGFlow user avatar" :src="avatarUrl" />
        <div class="overflow-hidden">
          <p class="text-on-surface font-bold truncate">{{ profileName }}</p>
          <p class="text-on-surface-variant text-[11px] truncate">{{ profileSubtitle }}</p>
        </div>
      </div>
      <button class="sign-out-button" type="button" @click="emit('sign-out')">
        <span class="material-symbols-outlined text-[18px]">logout</span>
        Sign out
      </button>
    </div>
  </aside>
</template>
