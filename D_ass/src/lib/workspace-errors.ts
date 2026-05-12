import { IntegrationApiError } from './api-client'

export function toFriendlyMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof IntegrationApiError) {
    return error.message
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}
