import { EDITORIAL_TIMEZONE } from './timezone'
import type { Edition, NewsItem, NewsType } from './types'
import { HEADLINE_MAX, NEWS_TYPES } from './types'

function isNewsType(value: unknown): value is NewsType {
  return value === 'good' || value === 'bad' || value === 'ugly'
}

function isItem(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  if (!isNewsType(item.type)) return false
  if (typeof item.headline !== 'string' || item.headline.length === 0) return false
  if (item.headline.length > HEADLINE_MAX) return false
  if (!Array.isArray(item.summaries) || item.summaries.length !== 3) return false
  if (!item.summaries.every((line) => typeof line === 'string' && line.length > 0)) {
    return false
  }
  if (typeof item.editorNote !== 'string' || item.editorNote.length === 0) return false
  if ('source' in item) {
    if (!item.source || typeof item.source !== 'object') return false
    const source = item.source as Record<string, unknown>
    if (typeof source.name !== 'string' || !source.name.trim()) return false
    if (typeof source.url !== 'string') return false
    try {
      const url = new URL(source.url)
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    } catch {
      return false
    }
  }
  return true
}

export function parseEdition(raw: unknown): Edition | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (data.timezone !== EDITORIAL_TIMEZONE) return null
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return null
  }
  const date = new Date(`${data.date}T00:00:00Z`)
  if (data.date.startsWith('0000-') || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data.date) {
    return null
  }
  if (!Array.isArray(data.items) || data.items.length !== 3) return null
  if (!data.items.every(isItem)) return null

  const types = data.items.map((item) => (item as NewsItem).type)
  if (new Set(types).size !== 3) return null

  const byType = Object.fromEntries(
    (data.items as NewsItem[]).map((item) => [item.type, item]),
  ) as Record<NewsType, NewsItem>

  return {
    date: data.date,
    timezone: EDITORIAL_TIMEZONE,
    items: NEWS_TYPES.map((type) => byType[type]) as Edition['items'],
  }
}
