import { computed, ref, watch, type ComputedRef } from 'vue'

import type { ReferenceCard } from '../types/workspace'

export function useReferenceViewer(referenceCards: ComputedRef<ReferenceCard[]>) {
  const activeReferenceNumber = ref<number | null>(null)

  function selectReference(referenceNumber: number): void {
    activeReferenceNumber.value = referenceNumber
  }

  watch(
    referenceCards,
    (cards) => {
      if (cards.length === 0) {
        activeReferenceNumber.value = null
        return
      }

      const firstCard = cards[0]
      if (!firstCard) {
        activeReferenceNumber.value = null
        return
      }

      const hasActiveReference = cards.some(
        (card) => card.referenceNumber === activeReferenceNumber.value,
      )
      if (!hasActiveReference) {
        activeReferenceNumber.value = firstCard.referenceNumber
      }
    },
    { immediate: true },
  )

  const activeReferenceCard = computed<ReferenceCard | null>(() => {
    if (activeReferenceNumber.value === null) {
      return null
    }

    return (
      referenceCards.value.find(
        (card) => card.referenceNumber === activeReferenceNumber.value,
      ) ?? null
    )
  })

  return {
    activeReferenceCard,
    activeReferenceNumber,
    selectReference,
  }
}
