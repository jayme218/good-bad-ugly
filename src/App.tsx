import { useEffect, useRef, useState } from 'react'
import { EditionUpdateNotice } from './components/EditionUpdateNotice'
import { compareEditions, createEditionChecker } from './editionUpdates'
import type { Edition } from './types'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { NewsCard } from './components/NewsCard'
import { StoryReader } from './components/StoryReader'
import { Unavailable } from './components/Unavailable'
import today from './data/today.json'
import { parseEdition } from './edition'
import { emptyOpened, loadOpened, saveOpened } from './openedState'
import { editorialToday, formatEditionDate } from './timezone'
import { createReadingPositions } from './readingPosition'
import type { NewsType } from './types'

const bundledEdition = parseEdition(today)
const mobileQuery = '(max-width: 1023px)'

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
    const timer = window.setInterval(sync, 60_000)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  return today
}

export default function App() {
  const [edition, setEdition] = useState(bundledEdition)
  const [pendingEdition, setPendingEdition] = useState<Edition | null>(null)
  const editionDate = edition?.date ?? null
  const editionRevision = edition?.revision ?? 0
  const editionIdentity = edition ? `${edition.date}:${editionRevision}` : 'unavailable'
  const focusNewEdition = useRef(false)

  useEffect(() => {
    if (!focusNewEdition.current) return
    focusNewEdition.current = false
    const firstStory = document.getElementById('story-trigger-good') ?? document.querySelector<HTMLElement>('.story-article')
    firstStory?.focus({ preventScroll: true })
  }, [editionIdentity])

  useEffect(() => {
    const checker = createEditionChecker(`${import.meta.env.BASE_URL}edition.json`, editionDate, (candidate) => {
      setPendingEdition((current) => !current || compareEditions(candidate, current) > 0 ? candidate : current)
    }, fetch, editionRevision)
    function checkWhenVisible() {
      if (document.visibilityState !== 'hidden') void checker.check()
    }
    checkWhenVisible()
    window.addEventListener('focus', checkWhenVisible)
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => {
      checker.dispose()
      window.removeEventListener('focus', checkWhenVisible)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [editionDate, editionRevision])

  function readNewEdition() {
    if (!pendingEdition || pendingEdition.date > editorialToday().iso) return
    if (edition && edition.date <= editorialToday().iso && compareEditions(pendingEdition, edition) <= 0) return
    focusNewEdition.current = true
    setEdition(pendingEdition)
    setPendingEdition(null)
  }

  return (
    <EditionView
      key={editionIdentity}
      edition={edition}
      pendingEdition={pendingEdition}
      onReadNewEdition={readNewEdition}
    />
  )
}

function EditionView({ edition, pendingEdition, onReadNewEdition }: {
  edition: Edition | null
  pendingEdition: Edition | null
  onReadNewEdition: () => void
}) {
  const isMobile = useIsMobile()
  const chicago = useChicagoToday()
  const [opened, setOpened] = useState(() => edition ? loadOpened(edition.date) : emptyOpened())
  const [reading, setReading] = useState<NewsType | null>(null)
  const [readingPositions] = useState(() => edition ? createReadingPositions(edition.date, edition.revision ?? 0) : null)

  useEffect(() => {
    const media = window.matchMedia(mobileQuery)
    function closeOnDesktop() {
      if (!media.matches) setReading(null)
    }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])

  if (!edition || edition.date > chicago.iso) {
    return (
      <div className="flex h-dvh flex-col overflow-y-auto bg-white text-black">
        {pendingEdition ? <EditionUpdateNotice edition={pendingEdition} onRead={onReadNewEdition} /> : null}
        <Unavailable />
      </div>
    )
  }

  const allOpened = opened.good && opened.bad && opened.ugly
  const editionDate = edition.date
  const stale = editionDate < chicago.iso
  const readingIndex = edition.items.findIndex((item) => item.type === reading)
  const readingItem = edition.items[readingIndex] ?? null
  const nextItem = readingIndex >= 0 ? edition.items[readingIndex + 1] : undefined

  function open(type: NewsType) {
    setOpened((current) => {
      const next = { ...current, [type]: true }
      saveOpened(editionDate, next)
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
        iso={editionDate}
        label={formatEditionDate(editionDate)}
        stale={stale}
        reviewStatus={edition.reviewStatus}
      />

      {reading === null && pendingEdition ? (
        <EditionUpdateNotice edition={pendingEdition} isCorrection={pendingEdition.date === edition.date} onRead={onReadNewEdition} />
      ) : null}

      <main
        aria-label={stale ? "This edition's three stories" : "Today's three stories"}
        className="mx-auto flex min-h-64 w-full max-w-[72rem] flex-1 shrink-0 items-stretch px-[clamp(1rem,4vw,2.5rem)] py-2"
      >
        <div className="grid h-full min-h-0 w-full grid-cols-3 gap-2 md:gap-5">
          {edition.items.map((item) => (
            <NewsCard
              key={item.type}
              item={item}
              open={opened[item.type]}
              filled={isMobile && opened[item.type]}
              isMobile={isMobile}
              onOpen={() => open(item.type)}
            />
          ))}
        </div>
      </main>

      <Footer visible={allOpened && reading === null} stale={stale} />

      {isMobile && readingItem && readingPositions ? (
        <StoryReader
          item={readingItem}
          positions={readingPositions}
          nextType={nextItem?.type}
          onNext={nextItem ? () => open(nextItem.type) : undefined}
          onClose={() => setReading(null)}
        />
      ) : null}
    </div>
  )
}
