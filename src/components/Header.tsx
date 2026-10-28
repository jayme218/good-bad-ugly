export function Header({
  visible,
  iso,
  label,
  stale,
}: {
  visible: boolean
  iso: string
  label: string
  stale: boolean
}) {
  return (
    <header
      className={`mx-auto flex min-h-[4.5rem] w-full max-w-[72rem] shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-[clamp(1rem,4vw,2.5rem)] py-3 ${visible ? 'chrome-in' : 'invisible'}`}
      aria-hidden={!visible}
    >
      <div className="min-w-0">
        <h1 className="font-serif text-[clamp(1.05rem,2.2vw,1.55rem)] leading-tight tracking-[-0.02em] text-pretty">
          The Good, The Bad, and The Ugly
        </h1>
        <p className="mt-1 font-sans text-xs leading-relaxed">
          Three stories a day. Open a card to read.
        </p>
      </div>
      <time
        dateTime={iso}
        className="font-sans text-[clamp(0.7rem,1.2vw,0.85rem)]"
      >
        {label}
      </time>
      {stale ? (
        <p role="status" className="w-full border-t border-black pt-3 font-sans text-sm leading-relaxed">
          Today's edition isn't available yet. Showing the {label} edition.
        </p>
      ) : null}
    </header>
  )
}
