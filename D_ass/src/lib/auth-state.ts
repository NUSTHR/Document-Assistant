import type { AuthUser } from '../types/integration'

const AUTHORIZATION_STORAGE_KEY = 'documentation-assistant:ragflow-authorization'
const USER_STORAGE_KEY = 'documentation-assistant:ragflow-user'

export function readAuthorization(): string {
  return window.localStorage.getItem(AUTHORIZATION_STORAGE_KEY) ?? ''
}

export function writeAuthorization(authorization: string): void {
  window.localStorage.setItem(AUTHORIZATION_STORAGE_KEY, authorization)
}

export function clearAuthorization(): void {
  window.localStorage.removeItem(AUTHORIZATION_STORAGE_KEY)
  window.localStorage.removeItem(USER_STORAGE_KEY)
}

export function readAuthUser(): AuthUser | null {
  const rawValue = window.localStorage.getItem(USER_STORAGE_KEY)
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthUser>
    if (typeof parsed.email !== 'string') {
      return null
    }
    return {
      id: String(parsed.id ?? ''),
      email: parsed.email,
      nickname: String(parsed.nickname ?? ''),
      avatar: String(parsed.avatar ?? ''),
    }
  } catch {
    return null
  }
}

export function writeAuthUser(user: AuthUser): void {
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user))
}
