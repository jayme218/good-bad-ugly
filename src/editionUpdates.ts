import { parseEdition } from './edition'
import { editorialToday } from './timezone'
import type { Edition } from './types'

export function newerPublishedEdition(raw: unknown, currentDate: string | null, today: string) {
  const candidate = parseEdition(raw)
  if (!candidate || candidate.date > today) return null
  const publishedCurrent = currentDate && currentDate <= today ? currentDate : null
  return !publishedCurrent || candidate.date > publishedCurrent ? candidate : null
}

export function createEditionChecker(
  url: string,
  currentDate: string | null,
  onUpdate: (edition: Edition) => void,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController()
  let disposed = false
  let inFlight: Promise<void> | null = null

  function check(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        const response = await fetcher(url, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        const raw: unknown = await response.json()
        const candidate = newerPublishedEdition(raw, currentDate, editorialToday().iso)
        if (!disposed && candidate) onUpdate(candidate)
      } catch {
        // An update check must never interrupt the edition already being read.
      }
    })().finally(() => { inFlight = null })
    return inFlight
  }

  return {
    check,
    dispose() {
      disposed = true
      controller.abort()
    },
  }
}
