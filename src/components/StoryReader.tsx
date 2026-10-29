import { useEffect, useLayoutEffect, useRef } from 'react'
import { StoryBody } from './NewsCard'
import { clampReadingPosition } from '../readingPosition'
import type { ReadingPositions } from '../readingPosition'
import type { NewsItem, NewsType } from '../types'

const labels: Record<NewsType, string> = {
  good: 'The Good',
  bad: 'The Bad',
  ugly: 'The Ugly',
}

type StoryReaderProps = {
  item: NewsItem
  positions: ReadingPositions
  nextType?: NewsType
  onNext?: () => void
  onClose: () => void
}

export function StoryReader({ item, positions, nextType, onNext, onClose }: StoryReaderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const latestType = useRef(item.type)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    dialog.showModal()
    return () => {
      dialog.close()
      document.getElementById(`story-trigger-${latestType.current}`)?.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    latestType.current = item.type
    const article = articleRef.current
    if (!article) return
    article.scrollTop = clampReadingPosition(positions.get(item.type), article.scrollHeight, article.clientHeight)
    article.focus({ preventScroll: true })
  }, [item.type, positions])

  useEffect(() => {
    const persist = () => positions.persist()
    function saveWhenHidden() {
      if (document.visibilityState === 'hidden') persist()
    }
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', saveWhenHidden)
    return () => {
      persist()
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', saveWhenHidden)
    }
  }, [positions])

  function rememberPosition() {
    const article = articleRef.current
    if (article) positions.set(item.type, Math.max(0, article.scrollTop))
    positions.persist()
  }

  function close() {
    rememberPosition()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={item.headline}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-white p-[clamp(0.75rem,3vw,1.75rem)] text-black backdrop:bg-white"
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[44rem] flex-col gap-3">
        <button
          type="button"
          autoFocus
          onClick={close}
          className="min-h-11 shrink-0 self-start cursor-pointer border border-black px-4 py-2 font-sans text-sm focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Back to stories
        </button>
        <article
          ref={articleRef}
          tabIndex={0}
          aria-label={item.headline}
          onScroll={(event) => positions.set(item.type, Math.max(0, event.currentTarget.scrollTop))}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border border-black focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <div className="flex min-h-full flex-col">
            <div className="flex-1">
              <StoryBody item={item} fillHeight={false} />
            </div>
            <div className="mx-[clamp(0.75rem,2vw,1.5rem)] shrink-0 border-t border-black">
              <button
                type="button"
                onClick={() => {
                  rememberPosition()
                  if (nextType && onNext) onNext()
                  else onClose()
                }}
                className="min-h-11 w-full cursor-pointer py-3 text-left font-sans text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
              >
                {nextType && onNext ? `Next: ${labels[nextType]}` : 'Back to stories'}
              </button>
            </div>
          </div>
        </article>
      </div>
    </dialog>
  )
}
