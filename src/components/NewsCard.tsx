import type { NewsItem, NewsType } from '../types'

const labels: Record<NewsType, string> = {
  good: 'The Good',
  bad: 'The Bad',
  ugly: 'The Ugly',
}

export function StoryBody({ item }: { item: NewsItem }) {
  const label = labels[item.type]

  return (
    <div className="story-in flex h-full min-h-0 flex-col px-[clamp(0.9rem,2vw,1.5rem)] py-[clamp(0.9rem,2.2vh,1.5rem)]">
      <p className="mb-[clamp(0.55rem,1.4vh,0.9rem)] font-serif text-[clamp(1rem,1.8vh,1.2rem)] italic leading-none">
        {label}
      </p>
      <h2 className="font-serif text-[clamp(1.35rem,3.2vh,1.85rem)] leading-[1.15] tracking-[-0.02em]">
        {item.headline}
      </h2>
      <ul className="mt-[clamp(0.75rem,1.8vh,1.15rem)] flex flex-col gap-[clamp(0.4rem,1.2vh,0.7rem)] font-sans text-[clamp(0.9rem,1.7vh,1.05rem)] leading-[1.45]">
        {item.summaries.map((summary) => (
          <li key={summary} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[0.55em] size-1 shrink-0 bg-black" />
            <span>{summary}</span>
          </li>
        ))}
      </ul>
      <blockquote className="mt-auto border-l border-black pt-[clamp(0.85rem,2vh,1.2rem)] pl-3 font-sans text-[clamp(0.85rem,1.55vh,0.95rem)] leading-[1.5]">
        {item.editorNote}
      </blockquote>
    </div>
  )
}

type NewsCardProps = {
  item: NewsItem
  open: boolean
  filled: boolean
  onOpen: () => void
}

export function NewsCard({ item, open, filled, onOpen }: NewsCardProps) {
  const label = labels[item.type]
  const boxClass =
    'flex h-full min-h-0 w-full flex-col overflow-hidden border border-black'

  if (!open || filled) {
    return (
      <button
        type="button"
        aria-label={open ? `Read ${label}` : `Open ${label}`}
        aria-expanded={open && !filled}
        onClick={onOpen}
        className={`${boxClass} story-box appearance-none p-0 cursor-pointer outline-none`}
        data-filled={filled ? 'true' : 'false'}
      />
    )
  }

  return (
    <article aria-label={label} className={`${boxClass} bg-white`}>
      <StoryBody item={item} />
    </article>
  )
}
