import { afterEach, describe, expect, it, vi } from 'vitest'
import { NEWS_TYPES, type Edition } from '../types'
import { createDraft, prepareCorrection, type LoadedEdition } from './model'
import { createPublicationChecker, draftMatchesPublication, pendingFromCorrection, publicationOutcome, restorePublication } from './publication'

const original: Edition = { date: '2026-11-02', timezone: 'America/Chicago', revision: 0, reviewStatus: 'automated',
  items: NEWS_TYPES.map((type) => ({ type, headline: 'A supported story',
    summaries: ['The agency reported its original findings.', 'The statement includes the available evidence.', 'The original report provides further context.'],
    editorNote: 'An attributed automatic draft.', source: { name: 'Agency', url: `https://example.com/${type}`, publishedAt: '2026-11-01' } })) as Edition['items'] }

const loaded = { raw: JSON.stringify(original), edition: original, sha256: 'a'.repeat(64) }
function fixture() {
  const draft = createDraft(loaded)
  draft.edition.items[0].headline = 'An owner correction'
  const pending = pendingFromCorrection(prepareCorrection(draft, '2099-01-01'), '2026-11-03T14:00:00Z')
  return { draft, pending, live: { raw: '', edition: structuredClone(pending.edition), sha256: 'b'.repeat(64) } }
}
afterEach(() => vi.useRealTimers())

describe('copied correction snapshots', () => {
  it('stores an independent snapshot and recovers it without a saved success claim', () => {
    const { draft, pending } = fixture()
    draft.edition.items[0].headline = 'More local edits'
    expect(pending.edition.items[0].headline).toBe('An owner correction')
    expect(draftMatchesPublication(draft, pending)).toBe(false)
    expect(restorePublication(JSON.stringify({ ...pending, kind: 'live' }))).toEqual(pending)
    expect(restorePublication(null)).toBeNull()
    expect(restorePublication('{bad')).toBeNull()
  })
  it('rejects malformed storage and invalid correction identities', () => {
    const { pending } = fixture()
    for (const value of [null, {}, { ...pending, version: 2 }, { ...pending, preparedAt: 'bad' },
      { ...pending, base: { ...pending.base, sha256: 'bad' } },
      { ...pending, edition: { ...pending.edition, revision: 9 } },
      { ...pending, edition: { ...pending.edition, date: '2026-11-01' } }]) {
      expect(restorePublication(JSON.stringify(value))).toBeNull()
    }
    expect(() => pendingFromCorrection('{}')).toThrow()
  })
  it('detects new text and review changes made after copying', () => {
    const { draft, pending } = fixture()
    expect(draftMatchesPublication(draft, pending)).toBe(true)
    draft.reviewed = true
    expect(draftMatchesPublication(draft, pending)).toBe(false)
    draft.edition.items[0].headline = ''
    expect(draftMatchesPublication(draft, pending)).toBe(false)
  })
})

it('distinguishes undoing the copied edit from a clean draft already based on the live correction', () => {
  const { draft, pending, live } = fixture()
  draft.edition = structuredClone(draft.original)
  expect(draftMatchesPublication(draft, pending)).toBe(false)
  const cleanPublishedDraft = createDraft(live)
  expect(draftMatchesPublication(cleanPublishedDraft, pending)).toBe(true)
})

describe('actual deployed content comparison', () => {
  it('matches content independently of JSON key order and formatting', () => {
    const { pending, live } = fixture()
    const item = live.edition.items[0]
    live.edition.items[0] = { source: item.source, editorNote: item.editorNote, summaries: item.summaries, headline: item.headline, type: item.type }
    expect(publicationOutcome(pending, live)).toBe('live')
  })
  it.each(['headline', 'summary', 'note', 'sourceName', 'sourceUrl', 'sourceDate', 'review'])('rejects equal revision with different %s', (field) => {
    const { pending, live } = fixture()
    const item = live.edition.items[0]
    if (field === 'headline') item.headline = 'Other owner change'
    if (field === 'summary') item.summaries[0] += ' Changed.'
    if (field === 'note') item.editorNote += ' Changed.'
    if (field === 'sourceName') item.source!.name = 'Other source'
    if (field === 'sourceUrl') item.source!.url = 'https://example.com/other'
    if (field === 'sourceDate') item.source!.publishedAt = '2026-10-01'
    if (field === 'review') live.edition.reviewStatus = 'reviewed'
    expect(publicationOutcome(pending, live)).toBe('different')
  })
  it('distinguishes an unchanged original, older cache, newer edit and next day', () => {
    const { pending, live } = fixture()
    expect(publicationOutcome(pending, loaded)).toBe('waiting')
    expect(publicationOutcome(pending, { ...loaded, edition: { ...original, date: '2026-11-01' } })).toBe('waiting')
    expect(publicationOutcome(pending, { ...live, edition: { ...live.edition, revision: 2 } })).toBe('different')
    expect(publicationOutcome(pending, { ...live, edition: { ...live.edition, date: '2026-11-03', revision: 0 } })).toBe('different')
    expect(publicationOutcome(pending, { ...loaded, sha256: 'c'.repeat(64) })).toBe('different')
  })
})

describe('publication checks', () => {
  it('coalesces focus requests and emits only a verified result', async () => {
    const { pending, live } = fixture()
    let resolve!: (v: LoadedEdition) => void
    const load = vi.fn(() => new Promise<LoadedEdition>((r) => { resolve = r }))
    const result = vi.fn()
    const checker = createPublicationChecker(pending, load, result)
    const first = checker.check()
    const second = checker.check()
    expect(load).toHaveBeenCalledTimes(1)
    expect(result).not.toHaveBeenCalled()
    resolve(live)
    await Promise.all([first, second])
    expect(result).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'live' }))
    checker.dispose()
  })
  it('aborts and ignores late success or errors from a replaced snapshot', async () => {
    const { pending, live } = fixture()
    let resolve!: (v: LoadedEdition) => void
    let signal!: AbortSignal
    const result = vi.fn()
    const checker = createPublicationChecker(pending, (s) => { signal = s; return new Promise((r) => { resolve = r }) }, result)
    const check = checker.check()
    checker.dispose()
    expect(signal.aborted).toBe(true)
    resolve(live)
    await check
    await checker.check()
    expect(result).not.toHaveBeenCalled()
  })
  it('never reports success after network failure, malformed or future data', async () => {
    const { pending, live } = fixture()
    for (const load of [async () => { throw Error('Do not expose secret details') },
      async () => ({ ...live, edition: {} } as LoadedEdition),
      async () => ({ ...live, edition: { ...live.edition, date: '2999-01-01' } })]) {
      const result = vi.fn()
      const checker = createPublicationChecker(pending, load, result)
      await checker.check()
      expect(result).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'error' }))
      expect(JSON.stringify(result.mock.calls)).not.toContain('secret')
      checker.dispose()
    }
  })
})


describe('slow publication servers', () => {
  it('times out verification instead of leaving the editor stuck checking', async () => {
    vi.useFakeTimers()
    const { pending } = fixture()
    const result = vi.fn()
    let signal!: AbortSignal
    const checker = createPublicationChecker(pending, (s) => { signal = s; return new Promise(() => {}) }, result)
    void checker.check()
    await vi.advanceTimersByTimeAsync(15_000)
    try {
      expect(result).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'error' }))
      expect(signal.aborted).toBe(true)
    } finally { checker.dispose() }
  })
})
