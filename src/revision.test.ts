import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import rawEdition from './data/today.json'
import { parseEdition } from './edition'
import { createEditionChecker, newerPublishedEdition } from './editionUpdates'
import { createReadingPositions } from './readingPosition'
import { Header } from './components/Header'
import { EditionUpdateNotice } from './components/EditionUpdateNotice'
import { StoryBody } from './components/NewsCard'

const date = '2026-10-30'
const legacyEdition = { date: rawEdition.date, timezone: rawEdition.timezone, items: rawEdition.items }
const revised = { ...legacyEdition, date, revision: 2, reviewStatus: 'automated' }
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('publication metadata', () => {
  it('preserves revision, review status and source publication date', () => {
    const raw = { ...revised, items: rawEdition.items.map((item) => ({ ...item, source: { name: 'Agency', url: 'https://example.com/report', publishedAt: '2026-10-29' } })) }
    const edition = parseEdition(raw)!
    expect(edition.revision).toBe(2)
    expect(edition.reviewStatus).toBe('automated')
    expect(edition.items[0].source?.publishedAt).toBe('2026-10-29')
  })
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2', null])('rejects invalid revision %s', (revision) => {
    expect(parseEdition({ ...revised, revision })).toBeNull()
  })
  it.each(['verified', '', null, 2])('rejects unsupported review status %s', (reviewStatus) => {
    expect(parseEdition({ ...revised, reviewStatus })).toBeNull()
  })
  it.each(['2026-02-30', '2026-10-30T12:00:00Z', null])('rejects invalid source date %s', (publishedAt) => {
    expect(parseEdition({ ...revised, items: rawEdition.items.map((item) => ({ ...item, source: { name: 'Agency', url: 'https://example.com/report', publishedAt } })) })).toBeNull()
  })
  it('retains compatibility with editions without metadata', () => {
    expect(parseEdition(legacyEdition)?.revision).toBeUndefined()
    expect(parseEdition(legacyEdition)?.reviewStatus).toBeUndefined()
  })
})

describe('correction selection', () => {
  it('offers only a higher same-date revision', () => {
    expect(newerPublishedEdition(revised, date, date, 1)?.revision).toBe(2)
    expect(newerPublishedEdition(revised, date, date, 2)).toBeNull()
    expect(newerPublishedEdition(revised, date, date, 3)).toBeNull()
    expect(newerPublishedEdition({ ...legacyEdition, date }, date, date, 1)).toBeNull()
  })
  it('compares date before revision and never accepts future editions', () => {
    expect(newerPublishedEdition({ ...revised, date: '2026-10-29', revision: 99 }, date, date, 1)).toBeNull()
    expect(newerPublishedEdition({ ...revised, date: '2026-10-31' }, date, date, 1)).toBeNull()
    expect(newerPublishedEdition({ ...rawEdition, date }, '2026-10-29', date, 99)?.date).toBe(date)
  })
  it('checks higher revisions through the fetch path', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-30T18:00:00Z'))
    const onUpdate = vi.fn()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => revised } as Response)
    const checker = createEditionChecker('/edition.json', date, onUpdate, fetcher, 1)
    await checker.check()
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }))
    checker.dispose()
  })
})

describe('revision reading positions', () => {
  it('isolates changed text while retaining legacy positions for revision zero', () => {
    const values = new Map<string, string>([[`gbu:reading:${date}`, '{"good":125}']])
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
    expect(createReadingPositions(date).get('good')).toBe(125)
    expect(createReadingPositions(date, 0).get('good')).toBe(125)
    const corrected = createReadingPositions(date, 1)
    expect(corrected.get('good')).toBe(0)
    corrected.set('good', 45)
    corrected.persist()
    expect(createReadingPositions(date, 1).get('good')).toBe(45)
    expect(createReadingPositions(date, 2).get('good')).toBe(0)
    expect(createReadingPositions(date).get('good')).toBe(125)
  })
})

describe('publication labels', () => {
  it('labels only automated drafts as not yet reviewed', () => {
    const header = { visible: true, iso: date, label: 'October 30', stale: false }
    const automatic = renderToStaticMarkup(createElement(Header, { ...header, reviewStatus: 'automated' }))
    expect(automatic).toContain('Automatically prepared')
    expect(automatic).toContain('not yet editor-reviewed')
    for (const reviewStatus of ['reviewed', undefined] as const) {
      expect(renderToStaticMarkup(createElement(Header, { ...header, reviewStatus }))).not.toContain('Automatically prepared')
    }
  })
  it('distinguishes a correction from a new date without hiding the date', () => {
    const edition = parseEdition(revised)!
    const html = renderToStaticMarkup(createElement(EditionUpdateNotice, { edition, isCorrection: true, onRead: () => {} }))
    expect(html).toContain('Updated edition available')
    expect(html).toContain('Read updated edition')
    expect(html).toContain(`dateTime="${date}"`)
    expect(html).not.toContain('New edition available')
  })
  it('shows the source publication date separately from the edition', () => {
    const item = { ...rawEdition.items[0], type: 'good' as const, source: { name: 'Agency', url: 'https://example.com/report', publishedAt: '2026-10-29' } }
    const html = renderToStaticMarkup(createElement(StoryBody, { item }))
    expect(html).toContain('Published')
    expect(html).toContain('dateTime="2026-10-29"')
    expect(html).toContain('Thursday, October 29, 2026')
  })
})
