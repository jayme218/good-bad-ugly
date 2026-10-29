import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampReadingPosition, createReadingPositions } from './readingPosition'

afterEach(() => vi.unstubAllGlobals())

function session() {
  const memory = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
  })
  return memory
}

describe('reading positions', () => {
  it('keeps stories independent and starts an unvisited story at the top', () => {
    session()
    const positions = createReadingPositions('2026-10-28')
    positions.set('good', 120)
    expect(positions.get('good')).toBe(120)
    expect(positions.get('bad')).toBe(0)
    positions.set('bad', 250)
    expect(positions.get('good')).toBe(120)
    expect(positions.get('bad')).toBe(250)
  })

  it('restores a saved edition after reload without carrying it to a new edition', () => {
    session()
    const positions = createReadingPositions('2026-10-28')
    positions.set('ugly', 190)
    positions.persist()
    expect(createReadingPositions('2026-10-28').get('ugly')).toBe(190)
    expect(createReadingPositions('2026-10-29').get('ugly')).toBe(0)
  })

  it('keeps in-memory positions when session storage is blocked', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    const positions = createReadingPositions('2026-10-28')
    positions.set('good', 75)
    expect(() => positions.persist()).not.toThrow()
    expect(positions.get('good')).toBe(75)
  })

  it.each(['bad json', 'null', '[]', '{"good":-5,"bad":"100","ugly":null}'])(
    'ignores malformed stored positions: %s', (raw) => {
      vi.stubGlobal('sessionStorage', { getItem: () => raw })
      const positions = createReadingPositions('2026-10-28')
      expect(['good', 'bad', 'ugly'].map((type) => positions.get(type as 'good' | 'bad' | 'ugly'))).toEqual([0, 0, 0])
    },
  )

  it.each([-1, Infinity, NaN])('does not keep invalid offset %s', (offset) => {
    session()
    const positions = createReadingPositions('2026-10-28')
    positions.set('good', offset)
    expect(positions.get('good')).toBe(0)
  })
})

describe('restoration bounds', () => {
  it('clamps saved positions when resized content is shorter', () => {
    expect(clampReadingPosition(500, 600, 400)).toBe(200)
    expect(clampReadingPosition(120, 600, 400)).toBe(120)
    expect(clampReadingPosition(120, 300, 400)).toBe(0)
  })
})
