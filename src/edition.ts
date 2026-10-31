import { EDITORIAL_TIMEZONE } from './timezone'
import type { Edition, NewsItem, NewsType } from './types'
import { HEADLINE_MAX, NEWS_TYPES } from './types'

function isNewsType(value: unknown): value is NewsType {
  return value === 'good' || value === 'bad' || value === 'ugly'
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
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
    if ('publishedAt' in source && !isCalendarDate(source.publishedAt)) return false
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
  if (!isCalendarDate(data.date)) return null
  if ('revision' in data && (typeof data.revision !== 'number' || !Number.isSafeInteger(data.revision) || data.revision < 0)) return null
  if ('reviewStatus' in data && data.reviewStatus !== 'automated' && data.reviewStatus !== 'reviewed') return null
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
    ...('revision' in data ? { revision: data.revision as number } : {}),
    ...('reviewStatus' in data ? { reviewStatus: data.reviewStatus as Edition['reviewStatus'] } : {}),
    items: NEWS_TYPES.map((type) => byType[type]) as Edition['items'],
  }
}
