import { Component, lazy, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import App from '../App'

const Editor = lazy(() => import('./Editor'))

class EditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Do not expose draft content in logs. */ }
  render() {
    if (this.state.failed) return <main className="h-dvh overflow-auto p-6 font-sans"><h1 className="font-display text-3xl font-bold">The editor could not open</h1><p className="mt-4">Reload this page to try again. Your saved draft stays on this device.</p><a className="mt-4 inline-block underline" href="#/">Return to reading</a><button className="ml-6 min-h-11 border border-black px-4" type="button" onClick={() => window.location.reload()}>Reload editor</button></main>
    return this.props.children
  }
}

export default function AppRoute() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    function update() { setHash(window.location.hash) }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  if (hash === '#/editor' || hash === '#/editor/') return <EditorBoundary><Suspense fallback={<main className="h-dvh overflow-auto p-6 font-sans" role="status">Opening the edition editor…</main>}><Editor /></Suspense></EditorBoundary>
  return <App />
}

