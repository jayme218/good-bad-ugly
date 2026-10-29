export function Footer({ visible, stale }: { visible: boolean; stale: boolean }) {
  return (
    <footer
      className={`flex min-h-11 shrink-0 items-center justify-center px-[clamp(1rem,3vw,2.5rem)] py-3 ${visible ? 'chrome-in' : 'invisible'}`}
      aria-hidden={!visible}
    >
      <p className="text-center font-sans text-[0.8125rem] leading-relaxed">
        {stale ? "That's this edition's three." : "That's today's three."} You can close this tab now.
      </p>
    </footer>
  )
}
