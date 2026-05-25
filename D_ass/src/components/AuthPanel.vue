<script setup lang="ts">
import { computed } from 'vue'

import type { AuthConfigResponse } from '../types/integration'

type AuthMode = 'login' | 'register'

const props = defineProps<{
  authConfig: AuthConfigResponse
  authEmail: string
  authErrorMessage: string
  authMode: AuthMode
  authNickname: string
  authPassword: string
  authSubmitLabel: string
  authTitle: string
  canSubmitAuth: boolean
}>()

const emit = defineEmits<{
  (event: 'submit-auth'): void
  (event: 'switch-mode', mode: AuthMode): void
  (event: 'update:authEmail', value: string): void
  (event: 'update:authNickname', value: string): void
  (event: 'update:authPassword', value: string): void
}>()

const authEmailModel = computed<string>({
  get: () => props.authEmail,
  set: (value) => emit('update:authEmail', value),
})

const authNicknameModel = computed<string>({
  get: () => props.authNickname,
  set: (value) => emit('update:authNickname', value),
})

const authPasswordModel = computed<string>({
  get: () => props.authPassword,
  set: (value) => emit('update:authPassword', value),
})
</script>

<template>
  <section class="auth-shell">
    <div class="auth-panel">
      <div class="auth-brand">
        <div class="auth-brand__icon">
          <span class="material-symbols-outlined">auto_awesome</span>
        </div>
        <div>
          <p>Documentation Assistant</p>
          <h1>{{ authTitle }}</h1>
        </div>
      </div>

      <form class="auth-form" @submit.prevent="emit('submit-auth')">
        <p class="auth-copy">
          Use your RAGFlow account. All assistants, knowledge bases, sessions, and permissions come directly from RAGFlow.
        </p>

        <label v-if="authMode === 'register'" class="auth-field">
          <span>Nickname</span>
          <input v-model.trim="authNicknameModel" type="text" autocomplete="name" />
        </label>
        <label class="auth-field">
          <span>Email</span>
          <input v-model.trim="authEmailModel" type="email" autocomplete="email" />
        </label>
        <label class="auth-field">
          <span>Password</span>
          <input
            v-model="authPasswordModel"
            type="password"
            :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
          />
        </label>

        <p v-if="authConfig.disable_password_login" class="auth-error">
          Password login is disabled in RAGFlow.
        </p>
        <p v-else-if="authErrorMessage" class="auth-error">{{ authErrorMessage }}</p>

        <button class="auth-submit" type="submit" :disabled="!canSubmitAuth">
          <span class="material-symbols-outlined">{{ authMode === 'login' ? 'login' : 'person_add' }}</span>
          {{ authSubmitLabel }}
        </button>
      </form>

      <div class="auth-switch">
        <button
          v-if="authMode === 'login' && authConfig.register_enabled"
          type="button"
          @click="emit('switch-mode', 'register')"
        >
          Create a RAGFlow account
        </button>
        <button
          v-if="authMode === 'register'"
          type="button"
          @click="emit('switch-mode', 'login')"
        >
          Back to sign in
        </button>
      </div>
    </div>
  </section>
</template>
