import type { ChatReference } from './integration'
import type { AnswerSegment } from './workspace'

export interface SessionItem {
  id: string
  name: string
  isPinned: boolean
  isDraft: boolean
}

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  answerContent: string
  thoughtContent: string
  hasThought: boolean
  references: ChatReference[]
  referenceNumbers: number[]
  citedReferenceNumbers: number[]
  answerSegments: AnswerSegment[]
}

export type SessionDialogMode = 'rename' | 'delete'
