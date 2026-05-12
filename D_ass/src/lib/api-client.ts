import { appConfig } from '../config/app-config'
import type { IntegrationErrorKind } from '../types/integration'

interface ErrorPayload {
  detail?: string
}

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
  if (statusCode >= 500) {
    return '服务暂时不可用，请稍后重试。'
  }

  if (statusCode === 404) {
    return '目标接口不存在，请确认服务版本是否匹配。'
  }

  if (statusCode === 400) {
    return fallbackMessage || '请求参数不合法，请检查输入内容。'
  }

  return fallbackMessage || `请求失败，状态码 ${statusCode}。`
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

export async function requestJson<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const timeout = createTimeoutSignal(appConfig.requestTimeoutMs)
  const mergedSignal =
    init.signal ? mergeAbortSignals([init.signal, timeout.signal]) : timeout.signal

  try {
    const response = await fetch(`${appConfig.integrationBaseUrl}${path}`, {
      ...init,
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
      throw new IntegrationApiError('timeout', '请求超时，请稍后重试。')
    }

    throw new IntegrationApiError('network', '网络异常，请检查服务是否启动。')
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
    const response = await fetch(`${appConfig.integrationBaseUrl}${path}`, {
      ...init,
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
      throw new IntegrationApiError('timeout', '请求超时，请稍后重试。')
    }

    throw new IntegrationApiError('network', '网络异常，请检查服务是否启动。')
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
    const response = await fetch(`${appConfig.integrationBaseUrl}${path}`, {
      ...init,
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
      throw new IntegrationApiError('invalid_response', '服务没有返回可读取的数据流。')
    }

    return response.body.getReader()
  } catch (error: unknown) {
    if (error instanceof IntegrationApiError) {
      throw error
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IntegrationApiError('timeout', '连接流式接口超时，请稍后重试。')
    }

    throw new IntegrationApiError('network', '流式连接失败，请检查网络或服务状态。')
  } finally {
    timeout.dispose()
  }
}
