export function Footer({ visible }: { visible: boolean }) {
  return (
    <footer
      className={`flex h-11 shrink-0 items-center justify-center px-[clamp(1rem,3vw,2.5rem)] ${visible ? 'chrome-in' : 'invisible'}`}
      aria-hidden={!visible}
    >
      <p className="text-center font-sans text-[clamp(0.7rem,1.3vh,0.8rem)]">
        You're all caught up for today. You can close this tab now.
      </p>
    </footer>
  )
}
