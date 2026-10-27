export function Unavailable() {
  return (
    <main className="flex h-dvh w-full flex-col items-center gap-5 overflow-y-auto bg-white p-6 text-center text-black">
      <h1 className="mt-auto shrink-0 font-serif text-2xl">Today's edition isn't available.</h1>
      <p className="max-w-sm shrink-0 font-sans text-sm leading-relaxed">
        Refresh to check for an available edition.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mb-auto min-h-11 shrink-0 cursor-pointer border border-black px-5 py-2 font-sans text-sm focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        Refresh
      </button>
    </main>
  )
}
