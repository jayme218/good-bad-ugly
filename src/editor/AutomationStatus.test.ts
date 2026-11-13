import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AutomationStatusView } from './AutomationStatus'
import { parseCollectionReport, type AutomationSnapshot } from './automation'

const now = new Date('2026-11-10T18:00:00Z')
const report = parseCollectionReport({ version: 1, checkedAt: '2026-11-10T13:25:00Z', editionDate: '2026-11-10', outcome: 'skipped', reason: 'insufficient-stories', eligible: { good: 2, bad: 0, ugly: 1 }, sources: [{ id: 'nasa', name: 'NASA', candidates: 2, exclusions: { duplicate: 2, unavailable: 1, unsuitable: 0, insufficientEvidence: 0, requestLimit: 0, noRecentEntries: 0 } }], workflow: { runId: '12345', runAttempt: 1 } }, now)!
const snapshot: AutomationSnapshot = { report, run: null, reportWarning: '', runsWarning: '', checkedAt: now.toISOString() }
const markup = (overrides: Partial<Parameters<typeof AutomationStatusView>[0]> = {}) => renderToStaticMarkup(createElement(AutomationStatusView, {
  snapshot, checking: false, edition: { date: '2026-11-09', revision: 2 }, onRefresh() {}, now, ...overrides,
}))

describe('admin automation status', () => {
  it('keeps collection reason, live edition and source evidence distinct', () => {
    const html = markup()
    expect(html).toContain('No new edition: eligible stories were missing')
    expect(html).toContain('Live edition')
    expect(html).toContain('revision 2')
    expect(html).toContain('Nov 9, 2026')
    expect(html).toContain('Last saved collection result')
    expect(html).toContain('Source details')
    expect(html).toContain('recently used')
    expect(html).toContain('access or parsing failure')
    expect(html).toContain('<details')
    expect(html).not.toContain('<details open')
    expect(html).not.toContain('Published successfully')
  })
  it('links to owner-authorized GitHub execution instead of claiming to retry locally', () => {
    const html = markup()
    expect(html).toContain('Open daily publisher')
    expect(html).toContain('Run workflow')
    expect(html).toContain('dry_run')
    expect(html).toContain('false')
    expect(html).toContain('GitHub checks the repository owner')
    expect(html).not.toContain('Retry now')
  })
  it('keeps partial availability visible without hiding the saved report', () => {
    const html = markup({ snapshot: { ...snapshot, runsWarning: 'GitHub status access is limited right now.' }, edition: null })
    expect(html).toContain('GitHub status access is limited')
    expect(html).toContain('NASA')
    expect(html).toContain('Not loaded yet')
  })
  it('announces checking and disables duplicate refresh', () => {
    const html = markup({ checking: true })
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Checking status')
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })
  it('does not invent source checks when an edition was already current', () => {
    const html = markup({ snapshot: { ...snapshot, report: { ...report, reason: 'already-current', eligible: null, sources: [{ ...report.sources[0], candidates: null }] } } })
    expect(html).toContain('Not checked')
    expect(html).toContain('Sources were not checked')
    expect(html).not.toContain('2 recently used')
  })
})
