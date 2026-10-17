import { useEffect, useRef, useState } from 'react'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { NewsCard } from './components/NewsCard'
import { StoryReader } from './components/StoryReader'
import { Unavailable } from './components/Unavailable'
import today from './data/today.json'
import { parseEdition } from './edition'
import { loadOpened, saveOpened } from './openedState'
import { editorialToday } from './timezone'
import type { NewsType } from './types'

const edition = parseEdition(today)
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

function useChicagoToday() {
  const [today, setToday] = useState(() => editorialToday())

  useEffect(() => {
    function sync() {
      const next = editorialToday()
      setToday((current) => (current.iso === next.iso ? current : next))
    }

    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  return today
}

export default function App() {
  const isMobile = useIsMobile()
  const chicago = useChicagoToday()
  const chicagoIso = useRef(chicago.iso)
  const [opened, setOpened] = useState(() => loadOpened(editorialToday().iso))
  const [reading, setReading] = useState<NewsType | null>(null)

  useEffect(() => {
    if (chicagoIso.current === chicago.iso) return
    chicagoIso.current = chicago.iso
    setOpened(loadOpened(chicago.iso))
    setReading(null)
  }, [chicago.iso])

  useEffect(() => {
    const media = window.matchMedia(mobileQuery)
    function closeOnDesktop() {
      if (!media.matches) setReading(null)
    }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])

  if (!edition) {
    return <Unavailable />
  }

  const allOpened = opened.good && opened.bad && opened.ugly
  const readingItem = edition.items.find((item) => item.type === reading) ?? null

  function open(type: NewsType) {
    setOpened((current) => {
      const next = { ...current, [type]: true }
      saveOpened(chicago.iso, next)
      return next
    })
    if (window.matchMedia(mobileQuery).matches) {
      setReading(type)
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-y-auto bg-white text-black">
      <Header
        visible={reading === null}
        iso={chicago.iso}
        label={chicago.label}
      />

      <main
        aria-label="Today's three stories"
        className="mx-auto flex min-h-64 w-full max-w-[72rem] flex-1 shrink-0 items-stretch px-[clamp(1rem,4vw,2.5rem)] py-2"
      >
        <div className="grid h-full min-h-0 w-full grid-cols-3 gap-2 md:gap-5">
          {edition.items.map((item) => (
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

      {isMobile && readingItem ? (
        <StoryReader item={readingItem} onClose={() => setReading(null)} />
      ) : null}
    </div>
  )
}
