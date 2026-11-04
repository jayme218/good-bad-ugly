import { parseEdition } from '../edition'
import { compareEditions } from '../editionUpdates'
import { editorialToday } from '../timezone'
import type { Edition } from '../types'
import { hasChanges, prepareCorrection, safeSource, type Draft, type LoadedEdition } from './model'

export const PUBLICATION_KEY = 'gbu:editor:publication'
export interface PendingPublication {
  version: 1
  base: { date: string; revision: number; sha256: string }
  edition: Edition
  preparedAt: string
}
export type PublicationResult = { kind: 'live' | 'waiting' | 'different'; current: LoadedEdition; checkedAt: string }
  | { kind: 'error'; checkedAt: string }

function snapshot(value: unknown): PendingPublication {
  if (!value || typeof value !== 'object') throw new Error('Invalid correction snapshot.')
  const data = value as PendingPublication
  const edition = parseEdition(data.edition)
  const base = data.base
  if (data.version !== 1 || !edition || !base || typeof base.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(base.sha256)
    || !Number.isSafeInteger(base.revision) || base.revision < 0 || !Number.isSafeInteger(base.revision + 1)
    || base.date !== edition.date || edition.revision !== base.revision + 1
    || typeof data.preparedAt !== 'string' || !Number.isFinite(Date.parse(data.preparedAt))
    || edition.items.some((item) => !item.headline.trim() || !item.editorNote.trim() || item.summaries.some((s) => !s.trim())
      || !item.source?.name.trim() || !safeSource(item.source.url)
      || (item.source.publishedAt && item.source.publishedAt > edition.date))) throw new Error('Invalid correction snapshot.')
  return JSON.parse(JSON.stringify({ version: 1, base: { date: base.date, revision: base.revision, sha256: base.sha256 }, edition, preparedAt: data.preparedAt }))
}

export function pendingFromCorrection(payload: string, preparedAt = new Date().toISOString()): PendingPublication {
  if (new TextEncoder().encode(payload).length > 65_536) throw new Error('Correction is too large.')
  return snapshot({ ...JSON.parse(payload), preparedAt })
}

export function restorePublication(raw: string | null): PendingPublication | null {
  if (!raw || new TextEncoder().encode(raw).length > 70_000) return null
  try { return snapshot(JSON.parse(raw)) } catch { return null }
}

function contentKey(edition: Edition): string {
  return JSON.stringify({ date: edition.date, timezone: edition.timezone, revision: edition.revision ?? 0,
    reviewStatus: edition.reviewStatus ?? null,
    items: edition.items.map((item) => ({ type: item.type, headline: item.headline, summaries: item.summaries, editorNote: item.editorNote,
      source: item.source ? { name: item.source.name, url: item.source.url, publishedAt: item.source.publishedAt ?? null } : null })) })
}

export function publicationOutcome(pending: PendingPublication, current: LoadedEdition): 'live' | 'waiting' | 'different' {
  const edition = parseEdition(current.edition)
  if (!edition) throw new Error('Invalid live edition.')
  if (contentKey(edition) === contentKey(pending.edition)) return 'live'
  if (compareEditions(edition, pending.edition) >= 0
    || (edition.date === pending.base.date && (edition.revision ?? 0) === pending.base.revision && current.sha256 !== pending.base.sha256)) return 'different'
  return 'waiting'
}

export function draftMatchesPublication(draft: Draft, pending: PendingPublication): boolean {
  if (!hasChanges(draft)) return contentKey(draft.original) === contentKey(pending.edition)
  try { return contentKey(JSON.parse(prepareCorrection(draft, editorialToday().iso)).edition) === contentKey(pending.edition) }
  catch { return false }
}

export function createPublicationChecker(pending: PendingPublication, load: (signal: AbortSignal) => Promise<LoadedEdition>, onResult: (result: PublicationResult) => void) {
  const target = snapshot(pending)
  let controller: AbortController | null = null
  let disposed = false
  let inFlight: Promise<void> | null = null
  return {
    check(): Promise<void> {
      if (disposed) return Promise.resolve()
      if (inFlight) return inFlight
      const request = new AbortController()
      controller = request
      let timeout: ReturnType<typeof setTimeout> | undefined
      const aborted = new Promise<never>((_, reject) => {
        request.signal.addEventListener('abort', () => reject(new Error('Verification stopped.')), { once: true })
        timeout = setTimeout(() => request.abort(), 15_000)
      })
      inFlight = (async () => {
        try {
          const current = await Promise.race([load(request.signal), aborted])
          const edition = parseEdition(current.edition)
          if (!edition || edition.date > editorialToday().iso || typeof current.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(current.sha256)) throw new Error('Invalid live edition.')
          if (!disposed) onResult({ kind: publicationOutcome(target, { ...current, edition }), current: { ...current, edition }, checkedAt: new Date().toISOString() })
        } catch {
          if (!disposed) onResult({ kind: 'error', checkedAt: new Date().toISOString() })
        }
      })().finally(() => { clearTimeout(timeout); controller = null; inFlight = null })
      return inFlight
    },
    dispose() { disposed = true; controller?.abort() },
  }
}
