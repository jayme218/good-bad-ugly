export function Header({
  visible,
  iso,
  label,
}: {
  visible: boolean
  iso: string
  label: string
}) {
  return (
    <header
      className={`flex min-h-[4.5rem] shrink-0 items-center justify-between gap-6 px-[clamp(1rem,3vw,2.5rem)] py-3 ${visible ? 'chrome-in' : 'invisible'}`}
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
        className="hidden shrink-0 font-sans text-[clamp(0.7rem,1.2vw,0.85rem)] sm:block"
      >
        {label}
      </time>
    </header>
  )
}
