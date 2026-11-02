import { describe, expect, it } from 'vitest'
import raw from '../data/today.json'
import { parseEdition } from '../edition'
import { createDraft, draftErrors, hasChanges, prepareCorrection, restoreDraft, safeSource, sha256, type LoadedEdition } from './model'

const original = parseEdition(raw)!
const loaded: LoadedEdition = { raw: JSON.stringify(raw), edition: original, sha256: 'a'.repeat(64) }
const today = '2099-01-01'

describe('owner correction preparation', () => {
  it('hashes original UTF-8 text without normalizing it', async () => {
    expect(await sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    expect(await sha256('é\n')).not.toBe(await sha256('é'))
  })
  it('requires a real change and never invents review', () => {
    const draft = createDraft(loaded)
    expect(hasChanges(draft)).toBe(false)
    expect(() => prepareCorrection(draft, today)).toThrow('Make a correction')
    draft.edition.items[0].headline = 'A corrected headline'
    const payload = JSON.parse(prepareCorrection(draft, today))
    expect(payload.base).toEqual({ date: original.date, revision: original.revision ?? 0, sha256: loaded.sha256 })
    expect(payload.edition.date).toBe(original.date)
    expect(payload.edition.revision).toBe((original.revision ?? 0) + 1)
    expect(payload.edition.reviewStatus).toBe(original.reviewStatus)
  })
  it('does not count legacy metadata defaults as a correction', () => {
    const legacy = { date: original.date, timezone: original.timezone, items: original.items }
    expect(hasChanges(createDraft({ ...loaded, edition: legacy }))).toBe(false)
  })
  it('allows an explicit review status change without text edits', () => {
    const draft = createDraft({ ...loaded, edition: { ...original, reviewStatus: 'automated' } })
    draft.reviewed = true
    expect(hasChanges(draft)).toBe(true)
    expect(JSON.parse(prepareCorrection(draft, today)).edition.reviewStatus).toBe('reviewed')
  })
  it('rejects blanks, long Unicode headlines, unsafe URLs and future source dates', () => {
    const draft = createDraft(loaded)
    const item = draft.edition.items[0]
    item.headline = '😀'.repeat(16)
    item.summaries[1] = '  '
    item.source = { name: '', url: 'https://me:secret@example.com/report', publishedAt: '2099-02-30' }
    const errors = draftErrors(draft, today)
    expect(errors['good.headline']).toMatch('30')
    expect(errors['good.summary1']).toMatch('summary')
    expect(errors['good.sourceName']).toMatch('source')
    expect(errors['good.sourceUrl']).toMatch('HTTPS')
    expect(errors['good.sourceDate']).toMatch('date')
    item.source.publishedAt = '2099-01-01'
    expect(draftErrors(draft, today)['good.sourceDate']).toMatch('edition')
  })
  it('does not permit changing the edition identity or a future edition', () => {
    const draft = createDraft(loaded)
    draft.edition.date = '2098-01-01'
    expect(draftErrors(draft, today).edition).toBeTruthy()
    const future = createDraft({ ...loaded, edition: { ...original, date: '2099-01-02' } })
    expect(draftErrors(future, today).edition).toBeTruthy()
  })
  it('caps correction size in UTF-8 bytes', () => {
    const draft = createDraft(loaded)
    draft.edition.items[0].editorNote = '한'.repeat(23000)
    expect(() => prepareCorrection(draft, today)).toThrow('64 KB')
  })
  it('recovers unfinished invalid fields but identifies a changed original', () => {
    const draft = createDraft(loaded)
    draft.edition.items[0].headline = ''
    const restored = restoreDraft(JSON.stringify(draft))!
    expect(restored.edition.items[0].headline).toBe('')
    expect(restored.base.sha256).not.toBe('b'.repeat(64))
    expect(restoreDraft('{broken')).toBeNull()
    expect(restoreDraft(JSON.stringify({ ...draft, base: { ...draft.base, sha256: 'bad' } }))).toBeNull()
  })
  it('only exposes safe HTTPS source links', () => {
    expect(safeSource('javascript:alert(1)')).toBeNull()
    expect(safeSource('http://example.com')).toBeNull()
    expect(safeSource('https://name@example.com')).toBeNull()
    expect(safeSource('https://@example.com/report')).toBeNull()
    expect(safeSource('https://example.com/a@b')).toBe('https://example.com/a@b')
    expect(safeSource('https:example.com/report')).toBeNull()
    expect(safeSource('https://example.com/a b')).toBeNull()
    expect(safeSource('https://example.com/report')).toBe('https://example.com/report')
  })
})
