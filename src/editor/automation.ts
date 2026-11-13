import { editorialToday } from '../timezone'

const REPOSITORY = 'jayme218/good-bad-ugly'
const API = `https://api.github.com/repos/${REPOSITORY}/actions`
export const DAILY_PUBLISHER_URL = `https://github.com/${REPOSITORY}/actions/workflows/publish.yml`
const REPORT_URL = `https://raw.githubusercontent.com/${REPOSITORY}/main/public/collection-status.json`
const EXCLUSIONS = ['duplicate', 'unavailable', 'unsuitable', 'insufficientEvidence', 'requestLimit', 'noRecentEntries'] as const
type Exclusion = typeof EXCLUSIONS[number]
export interface CollectionReport {
  version: 1
  checkedAt: string
  editionDate: string
  outcome: 'prepared' | 'skipped' | 'error'
  reason: 'ready' | 'already-current' | 'insufficient-stories' | 'edition-changed' | 'collection-error'
  eligible: { good: number; bad: number; ugly: number } | null
  sources: { id: string; name: string; candidates: number | null; exclusions: Record<Exclusion, number> }[]
  workflow: { runId: string; runAttempt: number } | null
}
export interface CollectionRun {
  id: string
  attempt: number
  event: 'schedule' | 'workflow_dispatch'
  createdAt: string
  startedAt: string | null
  updatedAt: string
  status: string
  conclusion: string | null
}
export interface AutomationSnapshot {
  report: CollectionReport | null
  run: CollectionRun | null
  reportWarning: string
  runsWarning: string
  checkedAt: string
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function count(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000 }
function day(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
}
function timestamp(value: unknown, now: Date): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day(value.slice(0, 10))) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && time <= now.getTime() + 60_000
}
function runId(value: unknown): string | null {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value
  return typeof id === 'string' && /^[1-9]\d{0,19}$/.test(id) ? id : null
}
export function runUrl(id: string) { return runId(id) ? `https://github.com/${REPOSITORY}/actions/runs/${id}` : null }

export function parseCollectionReport(value: unknown, now = new Date()): CollectionReport | null {
  if (!object(value) || value.version !== 1 || !timestamp(value.checkedAt, now) || !day(value.editionDate) || value.editionDate > editorialToday(now).iso) return null
  if (typeof value.outcome !== 'string' || !['prepared', 'skipped', 'error'].includes(value.outcome) || typeof value.reason !== 'string' || !['ready', 'already-current', 'insufficient-stories', 'edition-changed', 'collection-error'].includes(value.reason)) return null
  if ((value.outcome === 'prepared' && value.reason !== 'ready') || (value.outcome === 'error' && value.reason !== 'collection-error') || (value.outcome === 'skipped' && !['already-current', 'insufficient-stories', 'edition-changed'].includes(value.reason))) return null
  const eligible = value.eligible
  if (eligible !== null && (!object(eligible) || !['good', 'bad', 'ugly'].every((key) => count(eligible[key])))) return null
  if (!Array.isArray(value.sources) || value.sources.length > 24) return null
  const sources: CollectionReport['sources'] = []
  for (const source of value.sources) {
    if (!object(source) || typeof source.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(source.id) || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 100 || [...source.name].some((character) => character.charCodeAt(0) < 32)) return null
    if (sources.some((item) => item.id === source.id) || (source.candidates !== null && !count(source.candidates)) || !object(source.exclusions)) return null
    if (!EXCLUSIONS.every((key) => count((source.exclusions as Record<string, unknown>)[key]))) return null
    sources.push({ id: source.id, name: source.name, candidates: source.candidates as number | null, exclusions: Object.fromEntries(EXCLUSIONS.map((key) => [key, (source.exclusions as Record<string, number>)[key]])) as Record<Exclusion, number> })
  }
  let workflow: CollectionReport['workflow'] = null
  if (value.workflow !== null) {
    if (!object(value.workflow) || !runId(value.workflow.runId) || !count(value.workflow.runAttempt) || value.workflow.runAttempt < 1) return null
    workflow = { runId: runId(value.workflow.runId)!, runAttempt: value.workflow.runAttempt }
  }
  return { version: 1, checkedAt: value.checkedAt, editionDate: value.editionDate, outcome: value.outcome as CollectionReport['outcome'], reason: value.reason as CollectionReport['reason'], eligible: eligible as CollectionReport['eligible'], sources, workflow }
}

function runTime(run: CollectionRun) { return Date.parse(run.startedAt ?? run.createdAt) }

function parseRuns(value: unknown, event: CollectionRun['event'], now: Date): CollectionRun[] {
  if (!object(value) || !Array.isArray(value.workflow_runs) || value.workflow_runs.length > 5) throw new Error('Invalid workflow response')
  return value.workflow_runs.map((run): CollectionRun => {
    if (!object(run) || !runId(run.id) || run.event !== event || run.head_branch !== 'main' || !timestamp(run.created_at, now) || !timestamp(run.updated_at, now) || (run.run_started_at !== null && !timestamp(run.run_started_at, now))) throw new Error('Invalid workflow run')
    if (!count(run.run_attempt) || run.run_attempt < 1 || typeof run.status !== 'string' || !['queued', 'in_progress', 'completed', 'waiting', 'pending', 'requested'].includes(run.status)) throw new Error('Invalid workflow status')
    if (run.conclusion !== null && (typeof run.conclusion !== 'string' || !['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure'].includes(run.conclusion))) throw new Error('Invalid workflow conclusion')
    return { id: runId(run.id)!, attempt: run.run_attempt, event, createdAt: run.created_at, startedAt: run.run_started_at as string | null, updatedAt: run.updated_at, status: run.status, conclusion: run.conclusion as string | null }
  }).sort((a, b) => runTime(b) - runTime(a))
}

class RequestError extends Error {
  status: number
  constructor(status: number) { super('Public status request failed'); this.status = status }
}
async function request(url: string, signal: AbortSignal, fetcher: typeof fetch, limit: number): Promise<unknown> {
  const response = await fetcher(url, { signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new RequestError(response.status)
  const text = await response.text()
  if (text.length > limit) throw new Error('Status response too large')
  return JSON.parse(text)
}
function runsWarning(error: unknown) {
  return error instanceof RequestError && [403, 429].includes(error.status)
    ? 'GitHub status access is limited right now. Check the run on GitHub, or refresh later.'
    : 'GitHub run status could not be checked. Check the run on GitHub, or refresh when your connection returns.'
}

export async function loadAutomationSnapshot(signal: AbortSignal, fetcher: typeof fetch = fetch, now = new Date()): Promise<AutomationSnapshot> {
  const controller = new AbortController()
  const stop = () => controller.abort()
  if (signal.aborted) controller.abort()
  else signal.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(stop, 12_000)
  const snapshot: AutomationSnapshot = { report: null, run: null, reportWarning: '', runsWarning: '', checkedAt: now.toISOString() }
  try {
    const results = await Promise.allSettled([
      request(`${REPORT_URL}?status_check=${now.getTime()}`, controller.signal, fetcher, 64_000),
      request(`${API}/workflows/publish.yml/runs?branch=main&event=schedule&per_page=5`, controller.signal, fetcher, 256_000),
      request(`${API}/workflows/publish.yml/runs?branch=main&event=workflow_dispatch&per_page=5`, controller.signal, fetcher, 256_000),
    ])
    const report = results[0]
    if (report.status === 'fulfilled') {
      snapshot.report = parseCollectionReport(report.value, now)
      if (!snapshot.report) snapshot.reportWarning = 'The collection report could not be verified. Check GitHub for the latest collection.'
    } else snapshot.reportWarning = report.reason instanceof RequestError && report.reason.status === 404
      ? 'No collection report has been saved yet. The next collection will create one.'
      : 'The collection report could not be loaded. Refresh when your connection returns.'

    const warnings = new Set<string>()
    const warn = (message: string) => { warnings.add(message); snapshot.runsWarning = [...warnings].join(' ') }
    let scheduled: CollectionRun[] = []
    let manual: CollectionRun[] = []
    for (const [index, event] of [[1, 'schedule'], [2, 'workflow_dispatch']] as const) {
      const result = results[index]
      try {
        if (result.status === 'rejected') throw result.reason
        const runs = parseRuns(result.value, event, now)
        // GitHub lists original run creations; an older run rerun recently can fall outside this page.
        if (object(result.value) && ((typeof result.value.total_count === 'number' && result.value.total_count > runs.length) || (result.value.total_count === undefined && runs.length === 5))) {
          if (!snapshot.runsWarning.includes('history')) warn('Only recent workflow history was checked. An older rerun or collection may be missing; check GitHub to confirm the latest collection.')
        }
        if (event === 'schedule') scheduled = runs
        else manual = runs
      } catch (error) { warn(runsWarning(error)) }
    }
    snapshot.run = scheduled[0] ?? null
    // Inspect each recent manual attempt, since a dry run can hide an earlier real collection.
    // The two run lists and report cost three reads; at most five job reads keep the total at eight.
    for (const candidate of manual) {
      if (snapshot.run && runTime(candidate) <= runTime(snapshot.run)) break
      const reported = candidate.id === snapshot.report?.workflow?.runId && candidate.attempt === snapshot.report.workflow.runAttempt
      if (reported) { snapshot.run = candidate; break }
      try {
        const jobs = await request(`${API}/runs/${candidate.id}/attempts/${candidate.attempt}/jobs?per_page=30`, controller.signal, fetcher, 256_000)
        if (!object(jobs) || !Array.isArray(jobs.jobs) || jobs.jobs.length > 30) throw new Error('Invalid jobs')
        const collect = jobs.jobs.find((job: unknown) => object(job) && job.name === 'collect')
        const dryRun = jobs.jobs.find((job: unknown) => object(job) && job.name === 'dry_run' && job.conclusion !== 'skipped' && typeof job.status === 'string' && ['queued', 'in_progress', 'completed', 'waiting'].includes(job.status))
        if (object(collect) && collect.conclusion !== 'skipped' && typeof collect.status === 'string' && ['queued', 'in_progress', 'completed', 'waiting'].includes(collect.status)) {
          snapshot.run = candidate
          break
        }
        if (!object(dryRun)) warn('A recent manual run has no confirmed collection job. Check GitHub for its mode and publishing settings; the latest collection is not fully verified.')
        if ((typeof jobs.total_count === 'number' && jobs.total_count > jobs.jobs.length) || (jobs.total_count === undefined && jobs.jobs.length === 30)) warn('Manual job history is incomplete. Check GitHub to confirm the latest collection.')
      } catch (error) { warn(`A recent manual run could not be verified. ${runsWarning(error)}`) }
    }
    return snapshot
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', stop)
  }
}

export function automationSummary(snapshot: AutomationSnapshot, now = new Date()): { title: string; body: string } {
  const { report, run } = snapshot
  if (run && run.status !== 'completed') return { title: 'Collection run is in progress', body: 'The run has not finished. The live edition stays separate from this progress; refresh to check again.' }
  if (run && run.conclusion === null) return { title: 'Collection run result is unknown', body: 'GitHub has not supplied a conclusion for this completed run. Check the run on GitHub; an earlier saved report does not confirm its result.' }
  if (run && run.conclusion && !['success', 'skipped', 'neutral'].includes(run.conclusion)) return { title: run.conclusion === 'cancelled' ? 'Latest collection run was cancelled' : 'Latest collection run failed', body: 'Open the GitHub run to see the failing step and rerun it as the repository owner. The last saved report below may belong to an earlier run.' }
  if (run && (!report || report.workflow?.runId !== run.id || report.workflow.runAttempt !== run.attempt) && (!report || runTime(run) > Date.parse(report.checkedAt))) return { title: 'Newer run has no collection report yet', body: 'A completed workflow alone does not confirm a new edition. Check the run on GitHub and compare the live edition below.' }
  if (!report) return { title: 'Collection status unavailable', body: 'The live edition can still be edited. Check GitHub for collection progress or refresh status later.' }
  if (now.getTime() - Date.parse(report.checkedAt) > 36 * 60 * 60 * 1000) return { title: 'Collection report is out of date', body: 'The last saved report is more than 36 hours old. Check the daily publisher before assuming a recent collection ran.' }
  switch (report.reason) {
    case 'ready': return { title: 'Edition prepared for publication', body: 'The collector prepared three eligible stories. This report does not confirm deployment; compare the live edition below.' }
    case 'already-current': return { title: 'Existing edition kept', body: 'An edition for the collection date or later already exists. Collection did not replace it or any owner corrections.' }
    case 'insufficient-stories': return { title: 'No new edition: eligible stories were missing', body: 'The collector could not form a Good, Bad and Ugly edition from three distinct source groups. The previous edition was kept.' }
    case 'edition-changed': return { title: 'Collection stopped to protect an edit', body: 'The edition changed during collection. No automated replacement was saved. Check GitHub before collecting again.' }
    case 'collection-error': return { title: 'Collection could not finish', body: 'The collector encountered an error. Open the GitHub run for details; the previous live edition remains the reference.' }
  }
}

export function formatAutomationTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value))
}
