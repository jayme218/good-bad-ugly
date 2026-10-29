import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { StoryBody } from './components/NewsCard'
import today from './data/today.json'
import { parseEdition } from './edition'
import { openedStorageKey } from './openedState'
import { formatEditionDate } from './timezone'

const edition = parseEdition(today)!

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderEdition(daysAfter: number, viewportWidth = 1280) {
  const now = new Date(`${edition.date}T18:00:00Z`)
  now.setUTCDate(now.getUTCDate() + daysAfter)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  vi.stubGlobal('window', {
    matchMedia: (query: string) => {
      const maxWidth = /max-width:\s*(\d+)px/.exec(query)
      if (!maxWidth) throw new Error(`Unsupported test media query: ${query}`)
      return { matches: viewportWidth <= Number(maxWidth[1]) }
    },
  })
  const getItem = vi.fn((key: string) => key === openedStorageKey(edition.date)
    ? JSON.stringify({ good: true, bad: false, ugly: false })
    : null)
  vi.stubGlobal('localStorage', { getItem })
  return { html: renderToStaticMarkup(createElement(App)), getItem }
}

describe('publication display', () => {
  it.each([1, 3])('keeps the edition date and saved progress %i days later', (daysAfter) => {
    const { html, getItem } = renderEdition(daysAfter)
    expect(html).toContain(`dateTime="${edition.date}"`)
    expect(html).toContain(formatEditionDate(edition.date))
    expect(html).toContain('Showing the ')
    expect(html).toContain(edition.items[0].headline)
    expect(html).not.toContain(edition.items[1].headline)
    expect(getItem).toHaveBeenCalledExactlyOnceWith(openedStorageKey(edition.date))
  })

  it('keeps mobile headlines concealed while restoring opened state', () => {
    const { html } = renderEdition(1, 390)
    expect(html).toContain('The Good, opened. Read again')
    expect(html).toContain(`dateTime="${edition.date}"`)
    for (const item of edition.items) expect(html).not.toContain(item.headline)
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(3)
    expect(html).not.toContain('aria-expanded')
  })

  it('does not announce desktop cards as modal dialogs or collapsed disclosures', () => {
    const { html } = renderEdition(1)
    expect(html).not.toContain('aria-haspopup')
    expect(html).not.toContain('aria-expanded')
    expect(html).toContain('<article')
  })

  it('does not show a future edition as published', () => {
    const { html } = renderEdition(-1)
    expect(html).toContain('Refresh')
    expect(html).not.toContain('<time')
    for (const item of edition.items) expect(html).not.toContain(item.headline)
  })

  it.each([767, 768, 900, 1023])('offers focused reading at %ipx without revealing saved article headlines', (width) => {
    const { html } = renderEdition(1, width)
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(3)
    expect(html).toContain('The Good, opened. Read again')
    for (const item of edition.items) expect(html).not.toContain(item.headline)
  })

  it.each([1024, 1280])('shows saved stories inline at %ipx', (width) => {
    const { html } = renderEdition(1, width)
    expect(html).toContain(edition.items[0].headline)
    expect(html).not.toContain(edition.items[1].headline)
    expect(html).not.toContain('aria-haspopup')
  })
})

describe('story attribution', () => {
  it('explicitly identifies missing attribution and editorial opinion', () => {
    const { source: _source, ...item } = edition.items[0]
    const html = renderToStaticMarkup(createElement(StoryBody, { item }))
    expect(html).toContain('Source not provided')
    expect(html).toContain('Editor&#x27;s note')
    expect(html).not.toContain('<blockquote')
  })

  it('renders supplied attribution as a protected external link', () => {
    const item = { ...edition.items[0], source: { name: 'Example report', url: 'https://example.com/report' } }
    const html = renderToStaticMarkup(createElement(StoryBody, { item }))
    expect(html).toContain('href="https://example.com/report"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Source: Example report')
    expect(html).toContain('(opens in a new tab)')
    expect(html).not.toContain('Source not provided')
  })
})
