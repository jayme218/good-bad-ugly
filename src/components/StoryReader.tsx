import { useEffect, useRef } from 'react'
import { StoryBody } from './NewsCard'
import type { NewsItem } from '../types'

export function StoryReader({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    dialog.showModal()
    return () => {
      dialog.close()
      document.getElementById(`story-trigger-${item.type}`)?.focus({ preventScroll: true })
    }
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
          tabIndex={0}
          aria-label={item.headline}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border border-black focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <StoryBody item={item} />
        </article>
      </div>
    </dialog>
  )
}
