export const AUTHORIZATION_EXPIRED_EVENT = 'documentation-assistant:authorization-expired'

export interface AuthorizationExpiredDetail {
  message: string
}

export function emitAuthorizationExpired(message: string): void {
  window.dispatchEvent(
    new CustomEvent<AuthorizationExpiredDetail>(AUTHORIZATION_EXPIRED_EVENT, {
      detail: { message },
    }),
  )
}

export function listenAuthorizationExpired(
  handler: (detail: AuthorizationExpiredDetail) => void,
): () => void {
  const listener = (event: Event): void => {
    const customEvent = event as CustomEvent<AuthorizationExpiredDetail>
    handler(customEvent.detail ?? { message: 'Please sign in again.' })
  }

  window.addEventListener(AUTHORIZATION_EXPIRED_EVENT, listener)
  return () => window.removeEventListener(AUTHORIZATION_EXPIRED_EVENT, listener)
}
