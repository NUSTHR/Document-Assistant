export interface AnswerPresentation {
  answer: string
  thought: string
  hasThought: boolean
}

export function splitThoughtContent(content: string): AnswerPresentation {
  const closedMatch = content.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i)
  if (closedMatch) {
    return {
      thought: closedMatch[1]?.trim() ?? '',
      answer: (closedMatch[2] ?? '').trim(),
      hasThought: true,
    }
  }

  const openMatch = content.match(/<think>([\s\S]*)/i)
  if (openMatch) {
    return {
      thought: openMatch[1]?.trim() ?? '',
      answer: '',
      hasThought: true,
    }
  }

  if (!content.toLowerCase().includes('</think>')) {
    return {
      answer: content,
      thought: '',
      hasThought: false,
    }
  }

  return {
    thought: '',
    answer: content.replace(/<\/?think>/gi, '').trim(),
    hasThought: true,
  }
}

export function normalizeAnswerForAction(content: string): string {
  return splitThoughtContent(content).answer.trim()
}

export function contentsAreEquivalent(left: string, right: string): boolean {
  const normalizedLeft = normalizeComparableMessage(left)
  const normalizedRight = normalizeComparableMessage(right)
  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  if (normalizedLeft === normalizedRight) {
    return true
  }

  const shortest = normalizedLeft.length < normalizedRight.length ? normalizedLeft : normalizedRight
  const longest = normalizedLeft.length < normalizedRight.length ? normalizedRight : normalizedLeft
  return shortest.length >= 80 && longest.includes(shortest.slice(0, 80))
}

export function normalizeComparableMessage(value: string): string {
  const presentation = splitThoughtContent(normalizeMessageContent(value))
  const normalizedValue = presentation.answer || presentation.thought || normalizeMessageContent(value)
  return normalizedValue.replace(/\s+/g, ' ').trim()
}

export function normalizeMessageContent(value: string): string {
  return value
    .replace(/^\*\*ERROR\*\*:\s*/i, '')
    .replace(/^ERROR:\s*/i, '')
    .trim()
}
