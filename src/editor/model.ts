import { parseEdition } from '../edition'
import { HEADLINE_MAX, NEWS_TYPES, type Edition } from '../types'

export const DRAFT_KEY = 'gbu:editor:draft'
export const PUBLISHER_URL = 'https://github.com/jayme218/good-bad-ugly/actions/workflows/correct-edition.yml'
export interface LoadedEdition { raw: string; edition: Edition; sha256: string }
export interface Draft {
  version: 1
  base: { date: string; revision: number; sha256: string }
  original: Edition
  edition: Edition
  reviewed: boolean
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

export async function sha256(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createDraft(loaded: LoadedEdition): Draft {
  return {
    version: 1,
    base: { date: loaded.edition.date, revision: loaded.edition.revision ?? 0, sha256: loaded.sha256 },
    original: clone(loaded.edition), edition: clone(loaded.edition), reviewed: false,
  }
}

export function safeSource(value: string): string | null {
  try {
    if (!/^https:\/\//i.test(value) || /\s/.test(value)) return null
    const authority = value.slice(8).split(/[/?#]/, 1)[0]
    if (authority.includes('@')) return null
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function correctedEdition(draft: Draft): Edition {
  return {
    date: draft.base.date, timezone: 'America/Chicago', revision: draft.base.revision + 1,
    ...(draft.original.reviewStatus ? { reviewStatus: draft.original.reviewStatus } : {}),
    ...(draft.reviewed ? { reviewStatus: 'reviewed' as const } : {}),
    items: draft.edition.items.map((item) => ({
      type: item.type, headline: item.headline.trim(), summaries: item.summaries.map((line) => line.trim()),
      editorNote: item.editorNote.trim(),
      ...(item.source ? { source: {
        name: item.source.name.trim(), url: item.source.url.trim(),
        ...(item.source.publishedAt?.trim() ? { publishedAt: item.source.publishedAt.trim() } : {}),
      } } : {}),
    })) as Edition['items'],
  }
}

export function hasChanges(draft: Draft): boolean {
  const corrected = correctedEdition(draft)
  const comparable = { ...corrected, revision: draft.original.revision }
  return JSON.stringify(comparable) !== JSON.stringify(draft.original)
}

export function draftErrors(draft: Draft, today: string): Record<string, string> {
  const errors: Record<string, string> = {}
  if (draft.edition.date !== draft.base.date || draft.edition.timezone !== 'America/Chicago'
    || draft.base.date > today || !Number.isSafeInteger(draft.base.revision + 1)) {
    errors.edition = 'This edition cannot be corrected. Reload the current edition.'
  }
  for (const item of draft.edition.items) {
    const key = item.type
    if (!item.headline.trim() || item.headline.trim().length > HEADLINE_MAX) errors[`${key}.headline`] = 'Use a headline of 1–30 characters.'
    item.summaries.forEach((summary, index) => {
      if (!summary.trim()) errors[`${key}.summary${index}`] = 'Add a complete summary sentence.'
    })
    if (!item.editorNote.trim()) errors[`${key}.editorNote`] = 'Add an editorial note.'
    if (!item.source?.name.trim()) errors[`${key}.sourceName`] = 'Add the original source name.'
    if (!safeSource(item.source?.url.trim() ?? '')) errors[`${key}.sourceUrl`] = 'Use an HTTPS article URL without login details.'
    if (item.source?.publishedAt && (!calendarDate(item.source.publishedAt) || item.source.publishedAt > draft.base.date)) {
      errors[`${key}.sourceDate`] = 'Use a valid date on or before this edition’s date.'
    }
  }
  return errors
}

export function prepareCorrection(draft: Draft, today: string): string {
  if (Object.keys(draftErrors(draft, today)).length) throw new Error('Resolve the marked fields before preparing a correction.')
  if (!hasChanges(draft)) throw new Error('Make a correction or mark this edition reviewed first.')
  const payload = JSON.stringify({ version: 1, base: draft.base, edition: correctedEdition(draft) })
  if (new TextEncoder().encode(payload).length > 65_536) throw new Error('This correction exceeds 64 KB. Shorten the editorial notes or summaries.')
  return payload
}

export function restoreDraft(raw: string | null): Draft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw)
    if (value?.version !== 1 || typeof value.reviewed !== 'boolean' || !parseEdition(value.original)
      || typeof value.base?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.base.sha256)
      || value.base.date !== value.original.date || value.base.revision !== (value.original.revision ?? 0)) return null
    const edition = value.edition
    if (!edition || edition.date !== value.base.date || edition.timezone !== 'America/Chicago'
      || !Array.isArray(edition.items) || edition.items.length !== 3) return null
    for (let index = 0; index < NEWS_TYPES.length; index++) {
      const item = edition.items[index]
      if (item?.type !== NEWS_TYPES[index] || typeof item.headline !== 'string' || typeof item.editorNote !== 'string'
        || !Array.isArray(item.summaries) || item.summaries.length !== 3 || !item.summaries.every((line: unknown) => typeof line === 'string')) return null
      if (item.source !== undefined && (!item.source || typeof item.source.name !== 'string' || typeof item.source.url !== 'string'
        || (item.source.publishedAt !== undefined && typeof item.source.publishedAt !== 'string'))) return null
    }
    return value as Draft
  } catch { return null }
}
