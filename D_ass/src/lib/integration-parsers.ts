import { IntegrationApiError } from './api-client'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (value === null || typeof value === 'undefined') {
    return null
  }

  throw new IntegrationApiError('invalid_response', 'Invalid nullable string response.')
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}
