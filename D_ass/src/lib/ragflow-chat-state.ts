export function isUnavailableChatError(message: string, code = ''): boolean {
  if (code === 'RAGFLOW_CHAT_UNAVAILABLE') {
    return true
  }

  const normalizedMessage = message.toLowerCase()
  return (
    normalizedMessage.includes('chat resource was not found') ||
    (
      normalizedMessage.includes('chat assistant') &&
      normalizedMessage.includes('no longer available')
    ) ||
    normalizedMessage.includes('no ragflow chat assistant is available')
  )
}
