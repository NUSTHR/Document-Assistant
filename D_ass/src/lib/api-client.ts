import { appConfig } from '../config/app-config'
import type { IntegrationErrorKind } from '../types/integration'
import { readAuthorization } from './auth-state'

interface ErrorPayload {
  detail?: string
}

const AUTH_FREE_PATHS = new Set([
  '/api/auth/config',
  '/api/auth/login',
  '/api/auth/register',
])

export class IntegrationApiError extends Error {
  readonly kind: IntegrationErrorKind
  readonly statusCode: number | null

  constructor(kind: IntegrationErrorKind, message: string, statusCode: number | null = null) {
    super(message)
    this.name = 'IntegrationApiError'
    this.kind = kind
    this.statusCode = statusCode
  }
}

function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal
  dispose: () => void
} {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    dispose: () => window.clearTimeout(timeoutId),
  }
}

function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()

  const abort = (): void => {
    controller.abort()
  }

  for (const signal of signals) {
    if (signal.aborted) {
      abort()
      return controller.signal
    }

    signal.addEventListener('abort', abort, { once: true })
  }

  return controller.signal
}

function getFriendlyHttpMessage(statusCode: number, fallbackMessage: string): string {
  if (statusCode === 401) {
    return fallbackMessage || 'Please sign in to continue.'
  }

  if (statusCode >= 500) {
    return fallbackMessage || 'Service is temporarily unavailable.'
  }

  if (statusCode === 404) {
    return fallbackMessage || 'The target endpoint does not exist.'
  }

  if (statusCode === 400) {
    return fallbackMessage || 'The request parameters are invalid.'
  }

  return fallbackMessage || `Request failed with status ${statusCode}.`
}

async function parseErrorPayload(response: Response): Promise<string> {
  const responseText = await response.text()
  if (!responseText) {
    return ''
  }

  try {
    const payload = JSON.parse(responseText) as ErrorPayload
    return typeof payload.detail === 'string' ? payload.detail : responseText
  } catch {
    return responseText
  }
}

function withAuthorization(path: string, init: RequestInit): RequestInit {
  if (AUTH_FREE_PATHS.has(path)) {
    return init
  }

  const authorization = readAuthorization()
  if (!authorization) {
    return init
  }

  const headers = new Headers(init.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', authorization)
  }
  return {
    ...init,
    headers,
  }
}

export async function requestJson<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const timeout = createTimeoutSignal(appConfig.requestTimeoutMs)
  const mergedSignal =
    init.signal ? mergeAbortSignals([init.signal, timeout.signal]) : timeout.signal

  try {
    const authorizedInit = withAuthorization(path, init)
    const response = await fetch(`${appConfig.integrationBaseUrl}${path}`, {
      ...authorizedInit,
      signal: mergedSignal,
    })

    if (!response.ok) {
      const errorMessage = await parseErrorPayload(response)
      throw new IntegrationApiError(
        'http',
        getFriendlyHttpMessage(response.status, errorMessage),
        response.status,
      )
    }

    return (await response.json()) as TResponse
  } catch (error: unknown) {
    if (error instanceof IntegrationApiError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IntegrationApiError('timeout', 'Request timed out.')
    }

    throw new IntegrationApiError('network', 'Network error. Check whether the service is running.')
  } finally {
    timeout.dispose()
  }
}

export async function requestBlob(
  path: string,
  init: RequestInit,
): Promise<{ blob: Blob; mediaType: string }> {
  const timeout = createTimeoutSignal(appConfig.requestTimeoutMs)
  const mergedSignal =
    init.signal ? mergeAbortSignals([init.signal, timeout.signal]) : timeout.signal

  try {
    const authorizedInit = withAuthorization(path, init)
    const response = await fetch(`${appConfig.integrationBaseUrl}${path}`, {
      ...authorizedInit,
      signal: mergedSignal,
    })

    if (!response.ok) {
      const errorMessage = await parseErrorPayload(response)
      throw new IntegrationApiError(
        'http',
        getFriendlyHttpMessage(response.status, errorMessage),
        response.status,
      )
    }

    const blob = await response.blob()
    return {
      blob,
      mediaType: response.headers.get('Content-Type') ?? blob.type ?? 'application/octet-stream',
    }
  } catch (error: unknown) {
    if (error instanceof IntegrationApiError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IntegrationApiError('timeout', 'Request timed out.')
    }

    throw new IntegrationApiError('network', 'Network error. Check whether the service is running.')
  } finally {
    timeout.dispose()
  }
}

export async function openSseStream(
  path: string,
  init: RequestInit,
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const timeout = createTimeoutSignal(appConfig.streamConnectTimeoutMs)
  const mergedSignal =
    init.signal ? mergeAbortSignals([init.signal, timeout.signal]) : timeout.signal

  try {
    const authorizedInit = withAuthorization(path, init)
    const response = await fetch(`${appConfig.integrationBaseUrl}${path}`, {
      ...authorizedInit,
      signal: mergedSignal,
    })

    if (!response.ok) {
      const errorMessage = await parseErrorPayload(response)
      throw new IntegrationApiError(
        'http',
        getFriendlyHttpMessage(response.status, errorMessage),
        response.status,
      )
    }

    if (!response.body) {
      throw new IntegrationApiError('invalid_response', 'The service returned no readable stream.')
    }

    const reader = response.body.getReader()
    timeout.dispose()
    return reader
  } catch (error: unknown) {
    if (error instanceof IntegrationApiError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IntegrationApiError('timeout', 'Timed out while connecting to the stream.')
    }

    throw new IntegrationApiError('network', 'Streaming connection failed. Check network or service state.')
  } finally {
    timeout.dispose()
  }
}
