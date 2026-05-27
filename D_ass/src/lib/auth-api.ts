import type {
  AuthConfigResponse,
  AuthLoginPayload,
  AuthRegisterPayload,
  AuthSessionResponse,
  AuthUser,
} from '../types/integration'
import { IntegrationApiError, requestJson } from './api-client'
import { writeAuthorization, writeAuthUser } from './auth-state'
import { isRecord } from './integration-parsers'
import { encryptRagflowPassword } from './ragflow-password'

function parseAuthConfigResponse(value: unknown): AuthConfigResponse {
  if (
    !isRecord(value) ||
    typeof value.register_enabled !== 'boolean' ||
    typeof value.disable_password_login !== 'boolean'
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid auth config response.')
  }

  return {
    register_enabled: value.register_enabled,
    disable_password_login: value.disable_password_login,
  }
}

function parseAuthUser(value: unknown): AuthUser {
  if (!isRecord(value) || typeof value.email !== 'string') {
    throw new IntegrationApiError('invalid_response', 'Invalid auth user response.')
  }

  return {
    id: typeof value.id === 'string' ? value.id : '',
    email: value.email,
    nickname: typeof value.nickname === 'string' ? value.nickname : '',
    avatar: typeof value.avatar === 'string' ? value.avatar : '',
  }
}

function parseAuthSessionResponse(value: unknown): AuthSessionResponse {
  if (
    !isRecord(value) ||
    typeof value.authorization !== 'string' ||
    !isRecord(value.user)
  ) {
    throw new IntegrationApiError('invalid_response', 'Invalid auth response.')
  }

  return {
    authorization: value.authorization,
    user: parseAuthUser(value.user),
  }
}

function persistAuthSession(authSession: AuthSessionResponse): AuthSessionResponse {
  writeAuthorization(authSession.authorization)
  writeAuthUser(authSession.user)
  return authSession
}

export async function getAuthConfig(): Promise<AuthConfigResponse> {
  const response = await requestJson<unknown>('/api/auth/config', {
    method: 'GET',
  })
  return parseAuthConfigResponse(response)
}

export async function loginWithRagflow(payload: AuthLoginPayload): Promise<AuthSessionResponse> {
  const response = await requestJson<unknown>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: payload.email,
      password: encryptRagflowPassword(payload.password),
    }),
  })
  return persistAuthSession(parseAuthSessionResponse(response))
}

export async function registerWithRagflow(
  payload: AuthRegisterPayload,
): Promise<AuthSessionResponse> {
  const response = await requestJson<unknown>('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: payload.email,
      nickname: payload.nickname,
      password: encryptRagflowPassword(payload.password),
    }),
  })
  return persistAuthSession(parseAuthSessionResponse(response))
}

export async function getAuthUser(): Promise<AuthUser> {
  const response = await requestJson<unknown>('/api/auth/me', {
    method: 'GET',
  })
  const user = parseAuthUser(response)
  writeAuthUser(user)
  return user
}

export async function logoutFromRagflow(): Promise<void> {
  await requestJson<unknown>('/api/auth/logout', {
    method: 'POST',
  })
}
