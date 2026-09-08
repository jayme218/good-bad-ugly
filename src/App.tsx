import { useEffect, useState } from 'react'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { NewsCard, StoryBody } from './components/NewsCard'
import today from './data/today.json'
import type { NewsItem, NewsType } from './types'

const edition = today as NewsItem[]
const mobileQuery = '(max-width: 767px)'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia(mobileQuery).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(mobileQuery)
    function update() {
      setIsMobile(media.matches)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isMobile
}

export default function App() {
  const isMobile = useIsMobile()
  const [opened, setOpened] = useState<Record<NewsType, boolean>>({
    good: false,
    bad: false,
    ugly: false,
  })
  const [reading, setReading] = useState<NewsType | null>(null)
  const allOpened = opened.good && opened.bad && opened.ugly
  const readingItem = edition.find((item) => item.type === reading) ?? null

  function open(type: NewsType) {
    setOpened((current) => ({ ...current, [type]: true }))
    if (window.matchMedia(mobileQuery).matches) {
      setReading(type)
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setReading(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white text-black">
      <Header visible={allOpened && reading === null} />

      <main
        aria-label="Today's three stories"
        className="mx-auto flex min-h-0 w-full max-w-[72rem] flex-1 items-stretch px-[clamp(1rem,4vw,2.5rem)] py-2"
      >
        <div className="grid h-full min-h-0 w-full grid-cols-3 gap-2 md:gap-5">
          {edition.map((item) => (
            <NewsCard
              key={item.type}
              item={item}
              open={opened[item.type]}
              filled={isMobile && opened[item.type]}
              onOpen={() => open(item.type)}
            />
          ))}
        </div>
      </main>

      <Footer visible={allOpened && reading === null} />

      {readingItem ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Story"
          className="fixed inset-0 z-20 flex bg-white p-[clamp(1rem,4vw,1.75rem)]"
        >
          <article
            className="h-full w-full cursor-pointer overflow-hidden border border-black"
            onClick={() => setReading(null)}
          >
            <StoryBody item={readingItem} />
          </article>
        </div>
      ) : null}
    </div>
  )
}
