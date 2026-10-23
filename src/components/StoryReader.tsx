import { useEffect, useRef } from 'react'
import { StoryBody } from './NewsCard'
import type { NewsItem, NewsType } from '../types'

const labels: Record<NewsType, string> = {
  good: 'The Good',
  bad: 'The Bad',
  ugly: 'The Ugly',
}

type StoryReaderProps = {
  item: NewsItem
  nextType?: NewsType
  onNext?: () => void
  onClose: () => void
}

export function StoryReader({ item, nextType, onNext, onClose }: StoryReaderProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const latestType = useRef(item.type)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    dialog.showModal()
    return () => {
      dialog.close()
      document.getElementById(`story-trigger-${latestType.current}`)?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    latestType.current = item.type
    const article = articleRef.current
    if (!article) return
    article.scrollTop = 0
    article.focus({ preventScroll: true })
  }, [item.type])

  return (
    <dialog
      ref={dialogRef}
      aria-label={item.headline}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-white p-[clamp(1rem,4vw,1.75rem)] text-black backdrop:bg-white"
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="min-h-11 shrink-0 self-start cursor-pointer border border-black px-4 py-2 font-sans text-sm focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Back to stories
        </button>
        <article
          ref={articleRef}
          tabIndex={0}
          aria-label={item.headline}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border border-black focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <div className="flex min-h-full flex-col">
            <div className="flex-1">
              <StoryBody item={item} fillHeight={false} />
            </div>
            <div className="mx-[clamp(0.9rem,2vw,1.5rem)] shrink-0 border-t border-black">
              <button
                type="button"
                onClick={nextType && onNext ? onNext : onClose}
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
