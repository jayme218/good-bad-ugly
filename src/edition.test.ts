import { describe, expect, it } from 'vitest'
import rawEdition from './data/today.json'
import { parseEdition } from './edition'
import { emptyOpened, loadOpened, openedStorageKey, saveOpened } from './openedState'
import { editorialToday } from './timezone'

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
