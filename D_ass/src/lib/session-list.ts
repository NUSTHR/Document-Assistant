import type { RagflowSession } from '../types/integration'

export const DRAFT_SESSION_ID = '__draft_new_session__'
export const DRAFT_SESSION_NAME = 'New session'

interface UpsertSessionOptions {
  bizChatId: string
  bizSessionId: string
  name: string
}

export function isDraftSessionId(sessionId: string): boolean {
  return sessionId === DRAFT_SESSION_ID
}

export function createDraftSession(bizChatId: string): RagflowSession {
  return {
    biz_session_id: DRAFT_SESSION_ID,
    name: DRAFT_SESSION_NAME,
    biz_chat_id: bizChatId,
    messages: [],
  }
}

export function upsertSessionSummary(
  sessions: RagflowSession[],
  options: UpsertSessionOptions,
): RagflowSession[] {
  const bizSessionId = options.bizSessionId.trim()
  if (!bizSessionId) {
    return sessions
  }

  const sessionSummary: RagflowSession = {
    biz_session_id: bizSessionId,
    name: options.name.trim() || 'Untitled',
    biz_chat_id: options.bizChatId,
    messages: [],
  }
  const existingSession = sessions.find((session) => {
    return session.biz_session_id === bizSessionId
  })
  const nextSession = existingSession
    ? { ...existingSession, ...sessionSummary, messages: existingSession.messages }
    : sessionSummary

  return [
    nextSession,
    ...sessions.filter((session) => session.biz_session_id !== bizSessionId),
  ]
}
