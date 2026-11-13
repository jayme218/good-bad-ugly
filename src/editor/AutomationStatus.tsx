import { useEffect, useRef, useState } from 'react'
import type { Edition } from '../types'
import { automationSummary, DAILY_PUBLISHER_URL, formatAutomationTime, loadAutomationSnapshot, runUrl, type AutomationSnapshot, type CollectionReport } from './automation'
import './automation.css'

type LiveEdition = Pick<Edition, 'date' | 'revision'>
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
const exclusionLabels: Record<keyof CollectionReport['sources'][number]['exclusions'], string> = {
  duplicate: 'recently used', unavailable: 'access or parsing failure', unsuitable: 'category or provenance mismatch',
  insufficientEvidence: 'insufficient supporting text', requestLimit: 'request limit reached', noRecentEntries: 'feed with no eligible recent entries',
}

function sourceExclusions(source: CollectionReport['sources'][number]) {
  if (source.candidates === null) return 'Not checked'
  return (Object.entries(source.exclusions) as [keyof typeof exclusionLabels, number][])
    .filter(([, count]) => count > 0).map(([key, count]) => `${count} ${exclusionLabels[key]}`).join('; ') || 'No exclusions recorded'
}

export function AutomationStatusView({ snapshot, checking, edition, onRefresh, now = new Date() }: {
  snapshot: AutomationSnapshot | null; checking: boolean; edition: LiveEdition | null; onRefresh: () => void; now?: Date
}) {
  const report = snapshot?.report
  const run = snapshot?.run
  const summary = snapshot ? automationSummary(snapshot, now) : { title: 'Checking collection status', body: 'Loading the last saved result and the latest GitHub run.' }
  const runLink = run ? runUrl(run.id) : report?.workflow ? runUrl(report.workflow.runId) : null
  const reportLink = report?.workflow ? runUrl(report.workflow.runId) : null
  return <section className="editor-automation" aria-labelledby="editor-automation-title">
    <div className="editor-automation-heading"><h2 id="editor-automation-title">Automatic publishing</h2><button type="button" disabled={checking} onClick={onRefresh}>{checking ? 'Checking status…' : 'Refresh status'}</button></div>
    <div className="editor-automation-summary" aria-live="polite" aria-atomic="true"><h3>{summary.title}</h3><p>{summary.body}</p></div>
    <dl className="editor-automation-facts">
      <div><dt>Live edition</dt><dd>{edition ? <>{dateLabel(edition.date)} · revision {edition.revision ?? 0}</> : 'Not loaded yet'}</dd></div>
      <div><dt>Last saved collection result</dt><dd>{report ? <time dateTime={report.checkedAt}>{formatAutomationTime(report.checkedAt)}</time> : 'Not available'}</dd></div>
      {run ? <div><dt>Latest confirmed collection run</dt><dd><time dateTime={run.startedAt ?? run.createdAt}>{formatAutomationTime(run.startedAt ?? run.createdAt)}</time>{runLink ? <> · <a href={runLink} target="_blank" rel="noopener noreferrer">View run<span className="sr-only"> (opens in a new tab)</span></a></> : null}</dd></div> : null}
    </dl>
    {snapshot?.reportWarning ? <p className="editor-automation-warning">{snapshot.reportWarning}</p> : null}
    {snapshot?.runsWarning ? <p className="editor-automation-warning">{snapshot.runsWarning}</p> : null}
    {report ? <details className="editor-automation-details"><summary>Source details</summary>
      <p>Saved result for {dateLabel(report.editionDate)}.{reportLink ? <> <a href={reportLink} target="_blank" rel="noopener noreferrer">View this collection run<span className="sr-only"> (opens in a new tab)</span></a>.</> : null}</p>
      {report.eligible ? <p>Eligible stories: Good {report.eligible.good}, Bad {report.eligible.bad}, Ugly {report.eligible.ugly}. Eligibility does not guarantee a valid three-source combination.</p> : <p>Sources were not checked, or candidate counts were not recorded for this attempt.</p>}
      {report.sources.length ? <table><caption className="sr-only">Saved collection candidates and exclusions by source</caption><thead><tr><th scope="col">Source</th><th scope="col">Eligible</th><th scope="col">Excluded items or requests</th></tr></thead><tbody>
        {report.sources.map((source) => <tr key={source.id}><th scope="row">{source.name}</th><td>{source.candidates ?? 'Not checked'}</td><td>{sourceExclusions(source)}</td></tr>)}
      </tbody></table> : <p>No source diagnostics were recorded for this attempt.</p>}
      <p>Exclusions count items, feed checks or requests; they are not a count of all articles on a source website.</p>
    </details> : null}
    <details className="editor-automation-details"><summary>Run or retry a collection</summary><p>Open the daily publisher in GitHub. Choose <strong>Run workflow</strong> on <strong>main</strong>, set <strong>dry_run</strong> to <strong>false</strong>, then run. For an existing failed run, use GitHub’s rerun control. GitHub checks the repository owner before allowing changes.</p><a href={DAILY_PUBLISHER_URL} target="_blank" rel="noopener noreferrer">Open daily publisher<span className="sr-only"> (opens in a new tab)</span></a></details>
  </section>
}

export function AutomationStatus({ edition }: { edition: LiveEdition | null }) {
  const [snapshot, setSnapshot] = useState<AutomationSnapshot | null>(null)
  const [checking, setChecking] = useState(true)
  const [cycle, setCycle] = useState(0)
  const generation = useRef(0)
  const refreshing = useRef(false)
  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController()
    refreshing.current = true
    void loadAutomationSnapshot(controller.signal).then((next) => {
      if (controller.signal.aborted || generation.current !== current) return
      setSnapshot(next)
      setChecking(false)
      refreshing.current = false
    })
    return () => { generation.current += 1; controller.abort(); refreshing.current = false }
  }, [cycle])
  return <AutomationStatusView edition={edition} snapshot={snapshot} checking={checking} onRefresh={() => {
    if (refreshing.current) return
    refreshing.current = true
    setChecking(true)
    setCycle((value) => value + 1)
  }} />
}
