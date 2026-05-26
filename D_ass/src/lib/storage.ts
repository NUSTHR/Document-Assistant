export function readStringArray(storageKey: string): string[] {
  try {
    const value = window.localStorage.getItem(storageKey)
    if (!value) {
      return []
    }

    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}
