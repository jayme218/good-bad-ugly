export type NewsType = 'good' | 'bad' | 'ugly'

export interface NewsItem {
  type: NewsType
  headline: string
  summaries: string[]
  editorNote: string
}
