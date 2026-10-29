import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditionChecker, newerPublishedEdition } from './editionUpdates'
import rawEdition from './data/today.json'
import type { Edition } from './types'

const date = '2026-10-28'
const latest = { ...rawEdition, date }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T18:00:00Z'))
})
afterEach(() => vi.useRealTimers())

function response(raw: unknown, ok = true) {
  return { ok, json: async () => raw } as Response
}

describe('newer published editions', () => {
  it('accepts a newer valid edition without changing the active date', () => {
    expect(newerPublishedEdition(latest, '2026-10-27', date)?.date).toBe(date)
  })
  it.each(['2026-10-27', date, '2026-10-29'])('ignores old, same, or future candidate %s', (candidateDate) => {
    expect(newerPublishedEdition({ ...latest, date: candidateDate }, date, date)).toBeNull()
  })
  it.each([null, {}, { ...latest, items: [] }, { ...latest, date: '2026-02-30' }])('ignores malformed editions', (raw) => {
    expect(newerPublishedEdition(raw, '2026-10-27', date)).toBeNull()
  })
  it('offers recovery when the initial edition is invalid or future-dated', () => {
    expect(newerPublishedEdition(latest, null, date)?.date).toBe(date)
    expect(newerPublishedEdition(latest, '2026-10-29', date)?.date).toBe(date)
  })
})

describe('edition checks', () => {
  it('coalesces overlapping focus checks and requests uncached content', async () => {
    let finish!: (value: Response) => void
    const fetcher = vi.fn<typeof fetch>(() => new Promise((resolve) => { finish = resolve }))
    const updates: Edition[] = []
    const checker = createEditionChecker('/edition.json', '2026-10-27', (edition) => updates.push(edition), fetcher)
    const first = checker.check()
    const second = checker.check()
    expect(second).toBe(first)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/edition.json', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
    finish(response(latest))
    await Promise.all([first, second])
    expect(updates.map((edition) => edition.date)).toEqual([date])
    const retry = checker.check()
    expect(fetcher).toHaveBeenCalledTimes(2)
    finish(response(latest))
    await retry
    checker.dispose()
  })

  it('does not deliver a late result after disposal, even if the transport ignores abort', async () => {
    let finish!: (value: Response) => void
    const fetcher = vi.fn<typeof fetch>(() => new Promise((resolve) => { finish = resolve }))
    const update = vi.fn()
    const checker = createEditionChecker('/edition.json', null, update, fetcher)
    const pending = checker.check()
    const signal = fetcher.mock.calls[0][1]?.signal
    checker.dispose()
    expect(signal?.aborted).toBe(true)
    finish(response(latest))
    await pending
    expect(update).not.toHaveBeenCalled()
    await checker.check()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each(['network', 'html', 'status'] as const)('silently preserves reading on %s failure and permits retry', async (failure) => {
    const fetcher = vi.fn<typeof fetch>()
    if (failure === 'network') fetcher.mockRejectedValueOnce(new Error('offline'))
    else if (failure === 'html') fetcher.mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('HTML fallback') } } as unknown as Response)
    else fetcher.mockResolvedValueOnce(response(null, false))
    fetcher.mockResolvedValueOnce(response(latest))
    const update = vi.fn()
    const checker = createEditionChecker('/edition.json', '2026-10-27', update, fetcher)
    await checker.check()
    expect(update).not.toHaveBeenCalled()
    await checker.check()
    expect(update).toHaveBeenCalledOnce()
    checker.dispose()
  })

  it('evaluates publishability at response time using the Chicago date', async () => {
    vi.setSystemTime(new Date('2026-10-28T04:30:00Z'))
    const update = vi.fn()
    const checker = createEditionChecker('/edition.json', '2026-10-26', update, vi.fn<typeof fetch>().mockResolvedValue(response(latest)))
    await checker.check()
    expect(update).not.toHaveBeenCalled()
    vi.setSystemTime(new Date('2026-10-28T05:30:00Z'))
    await checker.check()
    expect(update).toHaveBeenCalledOnce()
    checker.dispose()
  })
})
