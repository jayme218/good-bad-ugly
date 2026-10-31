export type NewsType = 'good' | 'bad' | 'ugly'

export interface NewsItem {
  type: NewsType
  headline: string
  summaries: string[]
  editorNote: string
  source?: { name: string; url: string; publishedAt?: string }
}

export interface Edition {
  date: string
  timezone: 'America/Chicago'
  revision?: number
  reviewStatus?: 'automated' | 'reviewed'
  items: [NewsItem, NewsItem, NewsItem]
}

export type OpenedMap = Record<NewsType, boolean>

export const NEWS_TYPES: NewsType[] = ['good', 'bad', 'ugly']
export const HEADLINE_MAX = 30
