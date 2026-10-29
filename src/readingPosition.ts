import { NEWS_TYPES } from './types'
import type { NewsType } from './types'

function validOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function clampReadingPosition(position: number, scrollHeight: number, clientHeight: number) {
  return Math.min(validOffset(position) ? position : 0, Math.max(0, scrollHeight - clientHeight))
}

export function createReadingPositions(editionDate: string) {
  const key = `gbu:reading:${editionDate}`
  const offsets: Record<NewsType, number> = { good: 0, bad: 0, ugly: 0 }
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const type of NEWS_TYPES) {
        const value = (stored as Record<string, unknown>)[type]
        if (validOffset(value)) offsets[type] = value
      }
    }
  } catch {
    // Storage unavailable or invalid: use in-memory positions for this visit.
  }

  return {
    get: (type: NewsType) => offsets[type],
    set(type: NewsType, position: number) {
      offsets[type] = validOffset(position) ? position : 0
    },
    persist() {
      try {
        sessionStorage.setItem(key, JSON.stringify(offsets))
      } catch {
        // The reader still resumes within the mounted app when storage is blocked.
      }
    },
  }
}

export type ReadingPositions = ReturnType<typeof createReadingPositions>
