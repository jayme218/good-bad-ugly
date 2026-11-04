import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseEdition } from '../edition'
import raw from '../data/today.json'
import { PublicationStatus } from './PublicationStatus'
import type { PendingPublication, PublicationResult } from './publication'

const edition = { ...parseEdition(raw)!, date: '2026-11-02', revision: 1 }
const pending: PendingPublication = { version: 1, base: { date: edition.date, revision: 0, sha256: 'a'.repeat(64) }, edition, preparedAt: '2026-11-03T14:00:00Z' }
const current = { raw: JSON.stringify(edition), edition, sha256: 'b'.repeat(64) }
const result = (kind: 'live' | 'waiting' | 'different'): PublicationResult => ({ kind, current, checkedAt: '2026-11-03T15:00:00Z' })
const markup = (overrides: Partial<Parameters<typeof PublicationStatus>[0]> = {}) => renderToStaticMarkup(createElement(PublicationStatus, {
  pending, result: null, checking: false, additionalEdits: false, storageWarning: '', disabled: false, onCheck() {}, onLoad() {}, ...overrides,
}))

describe('publication completion feedback', () => {
  it('distinguishes a prepared correction from publication and names its target', () => {
    const html = markup()
    expect(html).toContain('Correction prepared')
    expect(html).toContain('not published')
    expect(html).toContain('revision 1')
    expect(html).not.toContain('Your correction is live')
    expect(html).not.toContain('Saved to GitHub')
  })
  it('announces checking politely and disables duplicate checking', () => {
    const html = markup({ checking: true })
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Checking the live site')
    expect(html).toMatch(/<button[^>]*disabled=""/)
  })
  it('keeps an earlier live edition pending without claiming failure or completion', () => {
    const html = markup({ result: result('waiting') })
    expect(html).toContain('Not live yet')
    expect(html).toContain('may still be deploying')
    expect(html).not.toContain('Your correction is live')
  })
  it('makes exact success actionable without discarding newer local edits', () => {
    const html = markup({ result: result('live'), additionalEdits: true })
    expect(html).toContain('Your correction is live')
    expect(html).toContain('Additional changes on this device are not published')
    expect(html).toContain('Load published correction')
    expect(html).toContain('Download a backup')
  })
  it('does not claim that a different published revision is the owner’s correction', () => {
    const html = markup({ result: result('different') })
    expect(html).toContain('A different version is live')
    expect(html).toContain('does not match this correction')
    expect(html).toContain('Your edits are kept here')
    expect(html).not.toContain('Your correction is live')
  })
  it('recovers from unavailable verification and local tracking storage', () => {
    const html = markup({ result: { kind: 'error', checkedAt: '2026-11-03T15:00:00Z' }, storageWarning: 'Tracking could not be saved on this device.' })
    expect(html).toContain('Unable to verify publication')
    expect(html).toContain('Check publication')
    expect(html).toContain('Tracking could not be saved')
    expect(html).not.toContain('Your correction is live')
  })
})
