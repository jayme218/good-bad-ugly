import { describe, expect, it, vi } from 'vitest'
import { automationSummary, loadAutomationSnapshot, parseCollectionReport, runUrl, type AutomationSnapshot } from './automation'

const now = new Date('2026-11-10T18:00:00Z')
const exclusions = { duplicate: 2, unavailable: 1, unsuitable: 0, insufficientEvidence: 0, requestLimit: 0, noRecentEntries: 0 }
export const reportFixture = {
  version: 1, checkedAt: '2026-11-10T13:25:00+00:00', editionDate: '2026-11-10', outcome: 'skipped', reason: 'insufficient-stories',
  eligible: { good: 2, bad: 0, ugly: 1 }, sources: [{ id: 'nasa', name: 'NASA', candidates: 2, exclusions }], workflow: { runId: '12345', runAttempt: 1 },
}
const githubRun = (id: number, event: string, time: string, conclusion: string | null = 'success') => ({ id, run_attempt: 1, event, head_branch: 'main', status: conclusion ? 'completed' : 'in_progress', conclusion, created_at: time, run_started_at: time, updated_at: time })
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const load = (handler: (url: string) => Promise<Response>) => loadAutomationSnapshot(new AbortController().signal, vi.fn((url) => handler(String(url))) as typeof fetch, now)

describe('collection report trust boundary', () => {
  it('accepts actual evidence and preserves a source that was not checked', () => {
    expect(parseCollectionReport(reportFixture, now)?.sources[0].exclusions.duplicate).toBe(2)
    const current = { ...reportFixture, reason: 'already-current', eligible: null, sources: [{ ...reportFixture.sources[0], candidates: null }] }
    expect(parseCollectionReport(current, now)?.sources[0].candidates).toBeNull()
  })
  it.each([
    { version: 2 }, { checkedAt: '2026-11-11T18:00:00Z' }, { checkedAt: '2026-02-30T12:00:00Z' }, { editionDate: '2026-02-30' },
    { editionDate: '2026-11-11' }, { outcome: ['skipped'] }, { reason: ['insufficient-stories'] }, { outcome: 'published' }, { outcome: 'prepared' }, { workflow: { runId: '123/evil', runAttempt: 1 } },
    { eligible: { good: 2, bad: -1, ugly: 1 } }, { sources: [{ ...reportFixture.sources[0], candidates: Infinity }] },
    { sources: [...reportFixture.sources, ...reportFixture.sources] },
  ])('rejects invalid or future evidence %j', (change) => {
    expect(parseCollectionReport({ ...reportFixture, ...change }, now)).toBeNull()
  })
  it('only constructs repository run links from safe numeric IDs', () => {
    expect(runUrl('12345')).toBe('https://github.com/jayme218/good-bad-ugly/actions/runs/12345')
    expect(runUrl('https://evil.example')).toBeNull()
  })
})

describe('free automation evidence loading', () => {
  it('finds a scheduled failure despite a previous skipped report and ignores a manual dry run', async () => {
    const called: string[] = []
    const snapshot = await load(async (url) => {
      called.push(url)
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [githubRun(23456, 'schedule', '2026-11-10T15:00:00Z', 'failure')] })
      if (url.includes('event=workflow_dispatch')) return response({ workflow_runs: [githubRun(34567, 'workflow_dispatch', '2026-11-10T16:00:00Z')] })
      return response({ jobs: [{ name: 'collect', status: 'completed', conclusion: 'skipped' }, { name: 'dry_run', status: 'completed', conclusion: 'success' }] })
    })
    expect(called).toHaveLength(4)
    expect(snapshot.run?.id).toBe('23456')
    expect(automationSummary(snapshot, now).title).toBe('Latest collection run failed')
    expect(snapshot.report?.reason).toBe('insufficient-stories')
  })
  it('uses a real manual collection job without treating overall success as a new edition', async () => {
    const snapshot = await load(async (url) => {
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [] })
      if (url.includes('event=workflow_dispatch')) return response({ workflow_runs: [githubRun(34567, 'workflow_dispatch', '2026-11-10T16:00:00Z')] })
      return response({ jobs: [{ name: 'collect', status: 'completed', conclusion: 'success' }] })
    })
    expect(snapshot.run?.id).toBe('34567')
    expect(automationSummary(snapshot, now).title).toBe('Newer run has no collection report yet')
    expect(automationSummary(snapshot, now).body).not.toContain('published successfully')
  })
  it('finds a failed manual collection behind a newer dry run', async () => {
    const snapshot = await load(async (url) => {
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [githubRun(100, 'schedule', '2026-11-10T14:00:00Z')] })
      if (url.includes('event=workflow_dispatch')) return response({ workflow_runs: [githubRun(300, 'workflow_dispatch', '2026-11-10T17:00:00Z'), githubRun(200, 'workflow_dispatch', '2026-11-10T16:00:00Z', 'failure')] })
      if (url.includes('/runs/300/')) return response({ jobs: [{ name: 'collect', status: 'completed', conclusion: 'skipped' }, { name: 'dry_run', status: 'completed', conclusion: 'success' }] })
      return response({ jobs: [{ name: 'collect', status: 'completed', conclusion: 'failure' }] })
    })
    expect(snapshot.run?.id).toBe('200')
    expect(automationSummary(snapshot, now).title).toBe('Latest collection run failed')
  })
  it('ranks a rerun by its attempt start even when its original creation predates a schedule', async () => {
    const snapshot = await load(async (url) => {
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [githubRun(100, 'schedule', '2026-11-10T13:00:00Z')] })
      if (url.includes('event=workflow_dispatch')) return response({ workflow_runs: [githubRun(300, 'workflow_dispatch', '2026-11-10T14:00:00Z'), { ...githubRun(200, 'workflow_dispatch', '2026-11-10T10:00:00Z', 'failure'), run_attempt: 2, run_started_at: '2026-11-10T16:00:00Z' }] })
      return response({ jobs: [{ name: 'collect', status: 'completed', conclusion: 'failure' }] })
    })
    expect(snapshot.run?.id).toBe('200')
    expect(snapshot.run?.attempt).toBe(2)
    expect(automationSummary(snapshot, now).title).toBe('Latest collection run failed')
  })
  it('ranks scheduled reruns by attempt start', async () => {
    const snapshot = await load(async (url) => {
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [githubRun(300, 'schedule', '2026-11-10T14:00:00Z'), { ...githubRun(200, 'schedule', '2026-11-10T10:00:00Z', 'failure'), run_attempt: 2, run_started_at: '2026-11-10T16:00:00Z' }] })
      return response({ workflow_runs: [] })
    })
    expect(snapshot.run?.id).toBe('200')
    expect(automationSummary(snapshot, now).title).toBe('Latest collection run failed')
  })
  it('warns that truncated history can omit the latest collection and stays within eight reads', async () => {
    const called: string[] = []
    const snapshot = await load(async (url) => {
      called.push(url)
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [] })
      if (url.includes('event=workflow_dispatch')) return response({ total_count: 6, workflow_runs: [17, 16, 15, 14, 13].map((hour) => githubRun(hour, 'workflow_dispatch', `2026-11-10T${hour}:00:00Z`)) })
      return response({ jobs: [{ name: 'collect', status: 'completed', conclusion: 'skipped' }, { name: 'dry_run', status: 'completed', conclusion: 'success' }] })
    })
    expect(snapshot.run).toBeNull()
    expect(snapshot.runsWarning).toContain('history')
    expect(snapshot.runsWarning).toContain('latest collection')
    expect(called).toHaveLength(8)
  })
  it('keeps a completed run with no conclusion unknown even when its report says prepared', async () => {
    const snapshot = await load(async (url) => {
      if (url.includes('raw.githubusercontent')) return response({ ...reportFixture, outcome: 'prepared', reason: 'ready' })
      if (url.includes('event=schedule')) return response({ workflow_runs: [{ ...githubRun(12345, 'schedule', '2026-11-10T13:00:00Z'), conclusion: null }] })
      return response({ workflow_runs: [] })
    })
    expect(automationSummary(snapshot, now).title).toBe('Collection run result is unknown')
  })
  it('keeps report diagnostics when the public API is rate limited', async () => {
    const snapshot = await load(async (url) => url.includes('raw.githubusercontent') ? response(reportFixture) : response({}, 403))
    expect(snapshot.report?.sources[0].candidates).toBe(2)
    expect(snapshot.runsWarning).toContain('GitHub')
    expect(snapshot.runsWarning).toContain('limited')
    expect(snapshot.run).toBeNull()
  })
  it('shows an honest empty state before the first actual collection report', async () => {
    const snapshot = await load(async (url) => url.includes('raw.githubusercontent') ? response({}, 404) : response({ workflow_runs: [] }))
    expect(snapshot.report).toBeNull()
    expect(snapshot.reportWarning).toContain('No collection report')
    expect(automationSummary(snapshot, now).title).toBe('Collection status unavailable')
  })
  it('keeps a scheduled run when manual run verification fails', async () => {
    const snapshot = await load(async (url) => {
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [githubRun(23456, 'schedule', '2026-11-10T15:00:00Z', 'failure')] })
      if (url.includes('event=workflow_dispatch')) return response({ workflow_runs: [githubRun(34567, 'workflow_dispatch', '2026-11-10T16:00:00Z')] })
      throw new Error('offline with secret details')
    })
    expect(snapshot.run?.conclusion).toBe('failure')
    expect(snapshot.runsWarning).toContain('manual')
    expect(JSON.stringify(snapshot)).not.toContain('secret details')
  })
  it('does not silently classify a manual run with missing jobs as a dry run', async () => {
    const snapshot = await load(async (url) => {
      if (url.includes('raw.githubusercontent')) return response(reportFixture)
      if (url.includes('event=schedule')) return response({ workflow_runs: [] })
      if (url.includes('event=workflow_dispatch')) return response({ workflow_runs: [githubRun(34567, 'workflow_dispatch', '2026-11-10T16:00:00Z')] })
      return response({ jobs: [] })
    })
    expect(snapshot.run).toBeNull()
    expect(snapshot.runsWarning).toContain('no confirmed collection job')
  })
  it('labels a saved report older than 36 hours instead of implying today was checked', () => {
    const snapshot: AutomationSnapshot = { report: parseCollectionReport({ ...reportFixture, checkedAt: '2026-11-08T13:25:00Z', editionDate: '2026-11-08' }, now), run: null, reportWarning: '', runsWarning: '', checkedAt: now.toISOString() }
    expect(automationSummary(snapshot, now).title).toBe('Collection report is out of date')
  })
  it('does not imply that a prepared candidate was deployed', () => {
    const snapshot: AutomationSnapshot = { report: parseCollectionReport({ ...reportFixture, outcome: 'prepared', reason: 'ready' }, now), run: null, reportWarning: '', runsWarning: '', checkedAt: now.toISOString() }
    expect(automationSummary(snapshot, now).title).toBe('Edition prepared for publication')
    expect(automationSummary(snapshot, now).body).toContain('does not confirm deployment')
  })
  it('times out stalled status reads without exposing an error or retrying', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error('private network diagnostic')), { once: true })
    }))
    try {
      const pending = loadAutomationSnapshot(new AbortController().signal, fetcher as typeof fetch, now)
      await vi.advanceTimersByTimeAsync(12_000)
      const snapshot = await pending
      expect(fetcher).toHaveBeenCalledTimes(3)
      expect(snapshot.reportWarning).toContain('could not be loaded')
      expect(snapshot.runsWarning).toContain('could not be checked')
      expect(JSON.stringify(snapshot)).not.toContain('private network diagnostic')
    } finally { vi.useRealTimers() }
  })
  it('passes cancellation through to all public reads', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
    }))
    const pending = loadAutomationSnapshot(controller.signal, fetcher as typeof fetch, now)
    controller.abort()
    const snapshot = await pending
    expect(fetcher.mock.calls.every(([, options]) => options.signal?.aborted)).toBe(true)
    expect(snapshot.report).toBeNull()
  })
})
