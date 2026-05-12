const DEFAULT_REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_STREAM_CONNECT_TIMEOUT_MS = 15_000
const DEFAULT_BASE_URL = 'http://localhost:8081'

function readPositiveNumber(
  rawValue: string | undefined,
  fallbackValue: number,
): number {
  if (!rawValue) {
    return fallbackValue
  }

  const parsedValue = Number(rawValue)
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue
  }

  return parsedValue
}

export interface AppConfig {
  integrationBaseUrl: string
  requestTimeoutMs: number
  streamConnectTimeoutMs: number
}

export const appConfig: AppConfig = {
  integrationBaseUrl:
    import.meta.env.VITE_RAGFLOW_INTEGRATION_BASE_URL ?? DEFAULT_BASE_URL,
  requestTimeoutMs: readPositiveNumber(
    import.meta.env.VITE_RAGFLOW_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
  ),
  streamConnectTimeoutMs: readPositiveNumber(
    import.meta.env.VITE_RAGFLOW_STREAM_CONNECT_TIMEOUT_MS,
    DEFAULT_STREAM_CONNECT_TIMEOUT_MS,
  ),
}
