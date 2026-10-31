import type { Edition } from '../types'
import { formatEditionDate } from '../timezone'

export function EditionUpdateNotice({ edition, onRead, isCorrection = false }: { edition: Edition; onRead: () => void; isCorrection?: boolean }) {
  return (
    <aside aria-label="Edition update" className="mx-auto w-full max-w-[72rem] shrink-0 px-[clamp(1rem,4vw,2.5rem)] pb-3">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-black py-3">
        <p role="status" className="font-sans text-sm leading-relaxed">
          {isCorrection ? 'Updated edition available' : 'New edition available'}: <time dateTime={edition.date}>{formatEditionDate(edition.date)}</time>
        </p>
        <button
          type="button"
          onClick={onRead}
          className="min-h-11 cursor-pointer border border-black px-4 py-2 font-sans text-sm focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {isCorrection ? 'Read updated edition' : 'Read new edition'}
        </button>
      </div>
    </aside>
  )
}
