import { computed, onBeforeUnmount, ref } from 'vue'

import {
  getAuthConfig,
  getAuthUser,
  loginWithRagflow,
  logoutFromRagflow,
  registerWithRagflow,
} from '../lib/auth-api'
import {
  clearAuthorization,
  readAuthUser,
  readAuthorization,
} from '../lib/auth-state'
import { listenAuthorizationExpired } from '../lib/auth-events'
import { toFriendlyMessage } from '../lib/workspace-errors'
import type { AuthConfigResponse, AuthUser } from '../types/integration'

export type AuthMode = 'login' | 'register'

interface UseAuthFlowOptions {
  onExistingSessionLoaded?: () => Promise<void> | void
  onSignedIn?: () => Promise<void> | void
  onSignedOut?: () => Promise<void> | void
}

export function useAuthFlow(options: UseAuthFlowOptions = {}) {
  const isAuthenticated = ref<boolean>(readAuthorization().trim().length > 0)
  const authUser = ref<AuthUser | null>(readAuthUser())
  const authMode = ref<AuthMode>('login')
  const authEmail = ref<string>('')
  const authPassword = ref<string>('')
  const authNickname = ref<string>('')
  const authErrorMessage = ref<string>('')
  const isAuthBusy = ref<boolean>(false)
  const authConfig = ref<AuthConfigResponse>({
    register_enabled: true,
    disable_password_login: false,
  })
  let isSigningOut = false
  const stopAuthorizationExpiredListener = listenAuthorizationExpired((detail) => {
    if (isSigningOut) {
      return
    }

    void expireAuthorization(detail.message || 'Please sign in again.')
  })

  onBeforeUnmount(stopAuthorizationExpiredListener)

  const profileName = computed(() => {
    return authUser.value?.nickname || authUser.value?.email || 'RAGFlow User'
  })

  const authTitle = computed(() => {
    return authMode.value === 'login' ? 'Sign in' : 'Create account'
  })

  const authSubmitLabel = computed(() => {
    if (isAuthBusy.value) {
      return authMode.value === 'login' ? 'Signing in...' : 'Creating...'
    }
    return authMode.value === 'login' ? 'Sign in' : 'Register'
  })

  const canSubmitAuth = computed(() => {
    const hasRequiredFields =
      authEmail.value.trim().length > 0 &&
      authPassword.value.length > 0 &&
      (
        authMode.value === 'login' ||
        authNickname.value.trim().length > 0
      )
    return hasRequiredFields && !isAuthBusy.value && !authConfig.value.disable_password_login
  })

  async function initializeAuth(): Promise<void> {
    await loadAuthConfig()
    if (!readAuthorization().trim()) {
      isAuthenticated.value = false
      return
    }

    try {
      authUser.value = await getAuthUser()
      isAuthenticated.value = true
      await options.onExistingSessionLoaded?.()
    } catch (error: unknown) {
      clearLocalAuthState(toFriendlyMessage(error, 'Please sign in again.'))
    }
  }

  async function loadAuthConfig(): Promise<void> {
    try {
      authConfig.value = await getAuthConfig()
      if (!authConfig.value.register_enabled && authMode.value === 'register') {
        authMode.value = 'login'
      }
    } catch {
      authConfig.value = {
        register_enabled: true,
        disable_password_login: false,
      }
    }
  }

  function switchAuthMode(nextMode: AuthMode): void {
    authMode.value = nextMode
    authErrorMessage.value = ''
  }

  async function submitAuth(): Promise<void> {
    if (!canSubmitAuth.value) {
      return
    }

    authErrorMessage.value = ''
    isAuthBusy.value = true

    try {
      const session = authMode.value === 'login'
        ? await loginWithRagflow({
          email: authEmail.value.trim(),
          password: authPassword.value,
        })
        : await registerWithRagflow({
          email: authEmail.value.trim(),
          nickname: authNickname.value.trim(),
          password: authPassword.value,
        })
      authUser.value = session.user
      isAuthenticated.value = true
      authPassword.value = ''
      await options.onSignedIn?.()
    } catch (error: unknown) {
      authErrorMessage.value = toFriendlyMessage(error, 'Authentication failed.')
    } finally {
      isAuthBusy.value = false
    }
  }

  async function signOut(): Promise<void> {
    isSigningOut = true
    try {
      await logoutFromRagflow()
    } catch {
      // Local sign-out should still clear the browser session if RAGFlow is unreachable.
    } finally {
      isSigningOut = false
    }
    clearAuthorization()
    clearLocalAuthState('')
    await options.onSignedOut?.()
  }

  async function expireAuthorization(message: string): Promise<void> {
    if (!isAuthenticated.value && !readAuthorization().trim()) {
      return
    }

    clearLocalAuthState(message)
    await options.onSignedOut?.()
  }

  function clearLocalAuthState(message: string): void {
    clearAuthorization()
    isAuthenticated.value = false
    authUser.value = null
    authPassword.value = ''
    if (message) {
      authErrorMessage.value = message
    }
  }

  return {
    authConfig,
    authEmail,
    authErrorMessage,
    authMode,
    authNickname,
    authPassword,
    authSubmitLabel,
    authTitle,
    authUser,
    canSubmitAuth,
    initializeAuth,
    isAuthBusy,
    isAuthenticated,
    loadAuthConfig,
    profileName,
    signOut,
    submitAuth,
    switchAuthMode,
  }
}
