import { describe, expect, it } from 'vitest'
import rawEdition from './data/today.json'
import { parseEdition } from './edition'
import { emptyOpened, loadOpened, openedStorageKey, saveOpened } from './openedState'
import { editorialToday, formatEditionDate } from './timezone'

describe('formatEditionDate', () => {
  it.each([
    ['2026-09-08', 'Tuesday, September 8, 2026'],
    ['2026-01-01', 'Thursday, January 1, 2026'],
    ['2024-02-29', 'Thursday, February 29, 2024'],
    ['2026-11-01', 'Sunday, November 1, 2026'],
  ])('formats edition %s without changing its calendar day', (iso, label) => {
    expect(formatEditionDate(iso)).toBe(label)
  })
})

describe('editorialToday', () => {
  it('uses America/Chicago, not UTC', () => {
    expect(editorialToday(new Date('2026-09-08T04:30:00Z'))).toEqual({
      iso: '2026-09-07',
      label: 'Monday, September 7, 2026',
    })
    expect(editorialToday(new Date('2026-09-08T05:30:00Z'))).toEqual({
      iso: '2026-09-08',
      label: 'Tuesday, September 8, 2026',
    })
  })
})

describe('parseEdition', () => {
  it.each(['2026-02-29', '2026-04-31', '2026-00-10', '2026-13-01', '2026-01-00', '0000-01-01', '1900-02-29'])(
    'rejects impossible Gregorian date %s',
    (date) => expect(parseEdition({ ...rawEdition, date })).toBeNull(),
  )

  it.each(['2024-02-29', '2000-02-29', '2026-12-31'])(
    'accepts valid Gregorian date %s',
    (date) => expect(parseEdition({ ...rawEdition, date })?.date).toBe(date),
  )

  function withSource(source: unknown) {
    return {
      ...rawEdition,
      items: rawEdition.items.map((item, index) => index === 0 ? { ...item, source } : item),
    }
  }

  it.each(['https://example.com/report', 'http://example.com/report'])(
    'preserves a valid source using %s',
    (url) => {
      const source = { name: 'Example publisher', url }
      expect(parseEdition(withSource(source))?.items[0].source).toEqual(source)
    },
  )

  it.each([
    null,
    undefined,
    'Example publisher',
    {},
    { name: '   ', url: 'https://example.com' },
    { name: 12, url: 'https://example.com' },
    { name: 'Publisher', url: 12 },
    { name: 'Publisher', url: '/report' },
    { name: 'Publisher', url: 'not a URL' },
    { name: 'Publisher', url: 'javascript:alert(1)' },
    { name: 'Publisher', url: 'data:text/html,hello' },
    { name: 'Publisher', url: 'ftp://example.com/report' },
  ])('rejects malformed or unsafe supplied source %#', (source) => {
    expect(parseEdition(withSource(source))).toBeNull()
  })

  it('accepts the shipping payload', () => {
    const edition = parseEdition(rawEdition)
    expect(edition?.items.map((item) => item.type)).toEqual([
      'good',
      'bad',
      'ugly',
    ])
  })

  it('rejects a missing type, the wrong count, or a long headline', () => {
    expect(parseEdition({ ...rawEdition, items: rawEdition.items.slice(0, 2) })).toBeNull()
    expect(
      parseEdition({
        ...rawEdition,
        items: rawEdition.items.map((item, index) =>
          index === 0 ? { ...item, type: 'bad' } : item,
        ),
      }),
    ).toBeNull()
    expect(
      parseEdition({
        ...rawEdition,
        items: rawEdition.items.map((item, index) =>
          index === 0
            ? { ...item, headline: 'This headline is definitely over thirty!' }
            : item,
        ),
      }),
    ).toBeNull()
  })
})

describe('opened state', () => {
  it('reads only the key for that Chicago date', () => {
    const memory: Record<string, string> = {}
    globalThis.localStorage = {
      getItem: (key) => memory[key] ?? null,
      setItem: (key, value) => {
        memory[key] = value
      },
      removeItem: (key) => {
        delete memory[key]
      },
      clear: () => {
        for (const key of Object.keys(memory)) delete memory[key]
      },
      key: (index) => Object.keys(memory)[index] ?? null,
      get length() {
        return Object.keys(memory).length
      },
    }

    saveOpened('2026-09-08', { good: true, bad: false, ugly: false })
    expect(memory[openedStorageKey('2026-09-08')]).toBeTruthy()
    expect(loadOpened('2026-09-08')).toEqual({
      good: true,
      bad: false,
      ugly: false,
    })
    expect(loadOpened('2026-09-09')).toEqual(emptyOpened())
  })
})
