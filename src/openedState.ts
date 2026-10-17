import type { OpenedMap } from './types'

export function emptyOpened(): OpenedMap {
  return { good: false, bad: false, ugly: false }
}

export function openedStorageKey(date: string) {
  return `gbu:opened:${date}`
}

function isOpenedMap(value: unknown): value is OpenedMap {
  if (!value || typeof value !== 'object') return false
  const map = value as Record<string, unknown>
  return (
    typeof map.good === 'boolean' &&
    typeof map.bad === 'boolean' &&
    typeof map.ugly === 'boolean'
  )
}

export function loadOpened(date: string): OpenedMap {
  try {
    const raw = localStorage.getItem(openedStorageKey(date))
    if (!raw) return emptyOpened()
    const parsed: unknown = JSON.parse(raw)
    if (!isOpenedMap(parsed)) return emptyOpened()
    return { good: parsed.good, bad: parsed.bad, ugly: parsed.ugly }
  } catch {
    return emptyOpened()
  }
}

export function saveOpened(date: string, opened: OpenedMap) {
  try {
    localStorage.setItem(openedStorageKey(date), JSON.stringify(opened))
  } catch {
    // Storage blocked — keep the session in memory only.
  }
}
