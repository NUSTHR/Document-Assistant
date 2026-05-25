import { computed, nextTick, ref, watch, type ComponentPublicInstance, type Ref } from 'vue'

import {
  extractCitedReferenceNumbers,
  resolveReferenceNumbers,
  toLiveSourceItems,
  type SourceItem,
} from '../lib/citation-sources'
import {
  resolveDisplayedSourceItems,
  type CitationDisplayMessage,
} from '../lib/citation-state'
import type { AnswerSegment, ReferenceCard } from '../types/workspace'

const SOURCE_CARD_RENDER_WAIT_FRAMES = 12
const SOURCE_CARD_FRAME_TIMEOUT_MS = 50
const SOURCE_CARD_SCROLL_ATTEMPTS = 4

type ReadableRef<T> = Pick<Ref<T>, 'value'>

interface SourceScrollTarget {
  container: HTMLElement
  element: HTMLElement
  source: SourceItem
}

interface SourceScrollPosition {
  top: number
  maxTop: number
}

interface UseSourceReferencesOptions<TMessage extends CitationDisplayMessage> {
  handleReferenceSelection: (referenceNumber: number) => void
  isStreamingChat: ReadableRef<boolean>
  liveAnswerSegments: ReadableRef<AnswerSegment[]>
  messages: ReadableRef<TMessage[]>
  readLatestSnapshot: (sessionId: string) => SourceItem[]
  readSnapshot: (sessionId: string, messageId: string) => SourceItem[]
  referenceCards: ReadableRef<ReferenceCard[]>
  sessionId: ReadableRef<string>
  streamedAnswer: ReadableRef<string>
  submittedQuestion: ReadableRef<string>
  writeSnapshot: (sessionId: string, messageId: string, items: SourceItem[]) => void
}

export function useSourceReferences<TMessage extends CitationDisplayMessage>(
  dependencies: UseSourceReferencesOptions<TMessage>,
) {
  const citationsOpen = ref<boolean>(false)
  const sourceScrollElement = ref<HTMLElement | null>(null)
  const sourceCardElements = new Map<string, HTMLElement>()
  const activeSourceModal = ref<SourceItem | null>(null)
  const activeCitationMessageId = ref<string>('')
  const activeSourceReferenceNumber = ref<number | null>(null)
  const sourceFocusSequence = ref<number>(0)

  const liveReferenceNumbers = computed(() => {
    return resolveReferenceNumbers(
      dependencies.liveAnswerSegments.value,
      dependencies.referenceCards.value.length,
    )
  })

  const liveCitedReferenceNumbers = computed(() => {
    return extractCitedReferenceNumbers(dependencies.liveAnswerSegments.value)
  })

  const liveSourceItems = computed<SourceItem[]>(() => {
    return toLiveSourceItems(
      dependencies.referenceCards.value,
      liveReferenceNumbers.value,
      liveCitedReferenceNumbers.value,
    )
  })

  const sourceItems = computed<SourceItem[]>(() => {
    const hasLiveReferenceState =
      dependencies.referenceCards.value.length > 0 &&
      liveCitedReferenceNumbers.value.length > 0 &&
      (
        dependencies.isStreamingChat.value ||
        dependencies.submittedQuestion.value.length > 0 ||
        dependencies.streamedAnswer.value.length > 0
      )

    return resolveDisplayedSourceItems({
      activeCitationMessageId: activeCitationMessageId.value,
      hasLiveReferenceState,
      liveSourceItems: liveSourceItems.value,
      messages: dependencies.messages.value,
      readLatestSnapshot: dependencies.readLatestSnapshot,
      readSnapshot: dependencies.readSnapshot,
      sessionId: dependencies.sessionId.value,
    })
  })

  const sourceCountLabel = computed(() => {
    return `${sourceItems.value.length} SOURCES FOUND`
  })

  const activeSourceModalPreview = computed(() => {
    if (!activeSourceModal.value) {
      return ''
    }

    return activeSourceModal.value.fullContent.trim()
  })

  watch(sourceItems, (items) => {
    pruneSourceCardElements(items)
    if (items.length > 0) {
      if (
        activeSourceReferenceNumber.value !== null &&
        !items.some((item) => item.referenceNumber === activeSourceReferenceNumber.value)
      ) {
        activeSourceReferenceNumber.value = null
      }
      const activeModal = activeSourceModal.value
      if (activeModal) {
        const modalIsStillVisible = items.some((item) => {
          return sourceElementKey(item) === sourceElementKey(activeModal)
        })
        if (!modalIsStillVisible) {
          activeSourceModal.value = null
        }
      }
      citationsOpen.value = true
      return
    }

    activeSourceModal.value = null
    activeSourceReferenceNumber.value = null
    sourceCardElements.clear()
  })

  function resetCitationUi(options: { closePanel?: boolean } = {}): void {
    sourceFocusSequence.value += 1
    activeSourceModal.value = null
    activeCitationMessageId.value = ''
    activeSourceReferenceNumber.value = null
    sourceCardElements.clear()
    if (options.closePanel) {
      citationsOpen.value = false
    }
  }

  function selectSource(source: SourceItem): void {
    void openSourceReference(source.referenceNumber, { openModal: true })
  }

  async function openSourceReference(
    referenceNumber: number | null,
    options: { messageId?: string; openModal?: boolean } = {},
  ): Promise<void> {
    if (referenceNumber === null) {
      return
    }

    const focusSequence = sourceFocusSequence.value + 1
    sourceFocusSequence.value = focusSequence

    activeSourceModal.value = null
    if (options.messageId) {
      activeCitationMessageId.value = options.messageId
    }

    citationsOpen.value = true
    activeSourceReferenceNumber.value = referenceNumber
    await nextTick()
    const target = await waitForSourceScrollTarget(referenceNumber, focusSequence)
    if (focusSequence !== sourceFocusSequence.value) {
      return
    }

    if (!target) {
      activeSourceReferenceNumber.value = null
      return
    }

    dependencies.handleReferenceSelection(referenceNumber)
    activeSourceReferenceNumber.value = referenceNumber
    if (options.openModal) {
      activeSourceModal.value = target.source
    }
    const centeredTarget = await centerSourceCard(referenceNumber, focusSequence, target)
    if (options.openModal && centeredTarget) {
      activeSourceModal.value = centeredTarget.source
    }
  }

  function closeSourceModal(): void {
    activeSourceModal.value = null
  }

  function storeSessionCitationSnapshot(
    nextSessionId: string,
    messageId: string,
    items: SourceItem[],
  ): void {
    dependencies.writeSnapshot(nextSessionId, messageId, items)
  }

  function setSourceCardElement(
    source: SourceItem,
    element: Element | ComponentPublicInstance | null,
  ): void {
    const key = sourceElementKey(source)
    if (!(element instanceof HTMLElement)) {
      sourceCardElements.delete(key)
      return
    }

    sourceCardElements.set(key, element)
  }

  function setSourceScrollElement(
    element: Element | ComponentPublicInstance | null,
  ): void {
    sourceScrollElement.value = element instanceof HTMLElement ? element : null
  }

  function pruneSourceCardElements(items: SourceItem[]): void {
    const validKeys = new Set(items.map(sourceElementKey))
    const container = sourceScrollElement.value

    for (const [key, element] of sourceCardElements.entries()) {
      if (!validKeys.has(key) || (container && !container.contains(element))) {
        sourceCardElements.delete(key)
      }
    }
  }

  async function centerSourceCard(
    referenceNumber: number,
    focusSequence: number,
    target: SourceScrollTarget,
  ): Promise<SourceScrollTarget | null> {
    let currentTarget: SourceScrollTarget | null = target

    for (let attempt = 0; attempt < SOURCE_CARD_SCROLL_ATTEMPTS; attempt += 1) {
      if (focusSequence !== sourceFocusSequence.value) {
        return null
      }

      currentTarget = resolveSourceScrollTarget(referenceNumber) ?? currentTarget
      if (!currentTarget) {
        return null
      }

      applySourceScrollPosition(currentTarget)
      await waitForNextFrame()
      if (focusSequence !== sourceFocusSequence.value) {
        return null
      }

      const refreshedTarget = resolveSourceScrollTarget(referenceNumber)
      if (refreshedTarget) {
        currentTarget = refreshedTarget
        if (sourceCardIsCentered(refreshedTarget)) {
          return refreshedTarget
        }
      }
    }

    if (currentTarget) {
      applySourceScrollPosition(currentTarget)
    }

    return currentTarget
  }

  function applySourceScrollPosition(target: SourceScrollTarget): void {
    const { container, element } = target
    const position = calculateSourceScrollPosition(container, element)
    container.scrollTop = position.top
  }

  function calculateSourceScrollPosition(
    container: HTMLElement,
    element: HTMLElement,
  ): SourceScrollPosition {
    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const rawTop =
      container.scrollTop +
      elementRect.top -
      containerRect.top -
      (container.clientHeight - elementRect.height) / 2
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight)
    const top = Math.min(maxTop, Math.max(0, rawTop))
    return { top, maxTop }
  }

  function sourceCardIsCentered(target: SourceScrollTarget): boolean {
    const { container, element } = target
    if (!container.contains(element)) {
      return false
    }

    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const elementCenter = elementRect.top + elementRect.height / 2
    return (
      elementCenter >= containerRect.top + containerRect.height * 0.25 &&
      elementCenter <= containerRect.bottom - containerRect.height * 0.25
    )
  }

  function waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => {
      let hasResolved = false
      let timeoutId = 0

      const resolveOnce = (): void => {
        if (hasResolved) {
          return
        }

        hasResolved = true
        window.clearTimeout(timeoutId)
        resolve()
      }

      timeoutId = window.setTimeout(resolveOnce, SOURCE_CARD_FRAME_TIMEOUT_MS)
      window.requestAnimationFrame(resolveOnce)
    })
  }

  async function waitForSourceScrollTarget(
    referenceNumber: number,
    focusSequence: number,
  ): Promise<SourceScrollTarget | null> {
    for (let attempt = 0; attempt < SOURCE_CARD_RENDER_WAIT_FRAMES; attempt += 1) {
      await nextTick()
      await waitForNextFrame()
      if (focusSequence !== sourceFocusSequence.value) {
        return null
      }

      const target = resolveSourceScrollTarget(referenceNumber)
      if (target) {
        return target
      }
    }

    return null
  }

  function resolveSourceScrollTarget(referenceNumber: number): SourceScrollTarget | null {
    const source = sourceItems.value.find((item) => {
      return item.referenceNumber === referenceNumber
    })
    if (!source) {
      return null
    }

    const container = sourceScrollElement.value
    const element = findSourceCardElement(source, container)
    return toReadySourceScrollTarget(container, element, source)
  }

  function findSourceCardElement(
    source: SourceItem,
    container: HTMLElement | null,
  ): HTMLElement | null {
    const key = sourceElementKey(source)
    const registeredElement = sourceCardElements.get(key)
    if (registeredElement && container?.contains(registeredElement)) {
      return registeredElement
    }

    return container?.querySelector<HTMLElement>(`[data-source-key="${key}"]`) ?? null
  }

  function toReadySourceScrollTarget(
    container: HTMLElement | null,
    element: HTMLElement | null | undefined,
    source: SourceItem,
  ): SourceScrollTarget | null {
    if (!container || !element) {
      return null
    }

    const containerRect = container.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    if (containerRect.height <= 0 || elementRect.height <= 0) {
      return null
    }

    return {
      container,
      element,
      source,
    }
  }

  function sourceElementKey(source: SourceItem): string {
    return `${source.referenceNumber}-${hashSourceId(source.id)}`
  }

  function hashSourceId(value: string): string {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    return (hash >>> 0).toString(36)
  }

  return {
    activeCitationMessageId,
    activeSourceModal,
    activeSourceModalPreview,
    activeSourceReferenceNumber,
    citationsOpen,
    closeSourceModal,
    liveSourceItems,
    openSourceReference,
    resetCitationUi,
    selectSource,
    setSourceCardElement,
    setSourceScrollElement,
    sourceCountLabel,
    sourceElementKey,
    sourceItems,
    storeSessionCitationSnapshot,
  }
}
