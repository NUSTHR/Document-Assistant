import { ref } from 'vue'

import type { SourceItem } from '../lib/citation-sources'

export interface SessionCitationSet {
  messageId: string
  items: SourceItem[]
}

export function useSessionCitationSnapshots() {
  const snapshots = ref<Record<string, SessionCitationSet[]>>({})

  function readLatestSnapshot(sessionId: string): SourceItem[] {
    if (!sessionId) {
      return []
    }

    const sets = snapshots.value[sessionId] ?? []
    return sets[sets.length - 1]?.items ?? []
  }

  function readSnapshot(sessionId: string, messageId: string): SourceItem[] {
    if (!sessionId || !messageId) {
      return []
    }

    return snapshots.value[sessionId]?.find((set) => set.messageId === messageId)?.items ?? []
  }

  function writeSnapshot(sessionId: string, messageId: string, items: SourceItem[]): void {
    if (!sessionId || !messageId || items.length === 0) {
      return
    }

    const existingSets = snapshots.value[sessionId] ?? []
    const nextSet: SessionCitationSet = { messageId, items }
    snapshots.value = {
      ...snapshots.value,
      [sessionId]: [
        ...existingSets.filter((set) => set.messageId !== messageId),
        nextSet,
      ],
    }
  }

  function removeSnapshot(sessionId: string): void {
    if (!sessionId || !(sessionId in snapshots.value)) {
      return
    }

    const { [sessionId]: _removedSnapshot, ...remainingSnapshots } = snapshots.value
    snapshots.value = remainingSnapshots
  }

  return {
    readLatestSnapshot,
    readSnapshot,
    removeSnapshot,
    writeSnapshot,
  }
}
