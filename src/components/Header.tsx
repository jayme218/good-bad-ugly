import { editorialToday } from '../timezone'

export function Header({ visible }: { visible: boolean }) {
  const today = editorialToday()

  return (
    <header
      className={`flex min-h-[3.25rem] shrink-0 items-center justify-between gap-6 px-[clamp(1rem,3vw,2.5rem)] ${visible ? 'chrome-in' : 'invisible'}`}
      aria-hidden={!visible}
    >
      <h1 className="min-w-0 font-serif text-[clamp(1.05rem,2.2vw,1.55rem)] leading-none tracking-[-0.02em] text-pretty">
        The Good, The Bad, and The Ugly
      </h1>
      <time
        dateTime={today.iso}
        className="hidden shrink-0 font-sans text-[clamp(0.7rem,1.2vw,0.85rem)] sm:block"
      >
        {today.label}
      </time>
    </header>
  )
}
