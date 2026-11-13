import { useEffect, useRef, useState, type ReactNode } from 'react'
import { compareEditions } from '../editionUpdates'
import { PublicationStatus } from './PublicationStatus'
import { AutomationStatus } from './AutomationStatus'
import { createPublicationChecker, draftMatchesPublication, pendingFromCorrection, PUBLICATION_KEY, restorePublication, type PendingPublication, type PublicationResult } from './publication'
import { StoryBody } from '../components/NewsCard'
import { parseEdition } from '../edition'
import { editorialToday, formatEditionDate } from '../timezone'
import { NEWS_TYPES, type NewsItem, type NewsType } from '../types'
import { createDraft, DRAFT_KEY, draftErrors, hasChanges, prepareCorrection, PUBLISHER_URL, restoreDraft, safeSource, sha256, type Draft, type LoadedEdition } from './model'
import './editor.css'

const labels = { good: 'The Good', bad: 'The Bad', ugly: 'The Ugly' }

async function loadEdition(signal?: AbortSignal): Promise<LoadedEdition> {
  const response = await fetch(`${import.meta.env.BASE_URL}edition.json?editor_check=${Date.now()}`, { cache: 'no-store', signal })
  if (!response.ok) throw new Error('The published edition could not be loaded. Check your connection and try again.')
  const raw = await response.text()
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error('The published edition is not readable right now. Try again shortly.') }
  const edition = parseEdition(data)
  if (!edition || edition.date > editorialToday().iso) throw new Error('The current edition is not available for editing yet.')
  return { raw, edition, sha256: await sha256(raw) }
}

function Field({ label, id, error, hint, children }: { label: string; id: string; error?: string; hint?: string; children: ReactNode }) {
  return <div className="editor-field">
    <label htmlFor={id}>{label}</label>
    {children}
    {hint ? <p id={`${id}-hint`} className="editor-hint">{hint}</p> : null}
    {error ? <p id={`${id}-error`} className="editor-error">{error}</p> : null}
  </div>
}

export default function Editor() {
  const [loaded, setLoaded] = useState<LoadedEdition | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [active, setActive] = useState<NewsType>('good')
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [storageState, setStorageState] = useState('')
  const [copyState, setCopyState] = useState('')
  const [copying, setCopying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fallback, setFallback] = useState('')
  const fallbackRef = useRef<HTMLTextAreaElement>(null)
  const skipRestore = useRef(false)
  const [pendingPublication, setPendingPublication] = useState<PendingPublication | null>(() => {
    try { return restorePublication(localStorage.getItem(PUBLICATION_KEY)) } catch { return null }
  })
  const pendingPublicationRef = useRef(pendingPublication)
  const [publicationResult, setPublicationResult] = useState<PublicationResult | null>(null)
  const [publicationChecking, setPublicationChecking] = useState(false)
  const [publicationStorageWarning, setPublicationStorageWarning] = useState('')
  const [checkCycle, setCheckCycle] = useState(0)

  function acceptLoaded(next: LoadedEdition) {
    setLoaded((current) => !current || compareEditions(next.edition, current.edition) >= 0 ? next : current)
  }

  function clearPublication() {
    pendingPublicationRef.current = null
    setPendingPublication(null)
    setPublicationResult(null)
    setPublicationChecking(false)
    try { localStorage.removeItem(PUBLICATION_KEY); setPublicationStorageWarning('') }
    catch { setPublicationStorageWarning('Progress tracking could not be cleared on this device.') }
  }

  useEffect(() => {
    if (!pendingPublication) return
    let generation = 0
    let timer: number | undefined
    let checker: ReturnType<typeof createPublicationChecker> | null = null
    let busy = false
    let lastStart = -Infinity
    let disposed = false
    function visible() { return document.visibilityState !== 'hidden' }
    function stop() {
      generation += 1
      window.clearTimeout(timer)
      timer = undefined
      checker?.dispose()
      checker = null
      busy = false
    }
    function start() {
      if (disposed || pendingPublicationRef.current !== pendingPublication || !visible() || busy || Date.now() - lastStart < 500) return
      stop()
      lastStart = Date.now()
      const cycle = generation
      let count = 0
      let outcome: PublicationResult['kind'] | null = null
      const currentChecker = createPublicationChecker(pendingPublication!, loadEdition, (result) => {
        if (disposed || cycle !== generation || pendingPublicationRef.current !== pendingPublication) return
        outcome = result.kind
        setPublicationResult(result)
        if (result.kind !== 'error') acceptLoaded(result.current)
      })
      checker = currentChecker
      async function check() {
        if (disposed || cycle !== generation || pendingPublicationRef.current !== pendingPublication || !visible() || count >= 6) return
        count += 1
        busy = true
        setPublicationChecking(true)
        await currentChecker.check()
        if (disposed || cycle !== generation || pendingPublicationRef.current !== pendingPublication) return
        busy = false
        setPublicationChecking(false)
        if (outcome === 'waiting' && count < 6 && visible()) timer = window.setTimeout(() => { void check() }, 10_000)
      }
      void check()
    }
    function visibility() {
      if (document.visibilityState === 'hidden') { stop(); lastStart = -Infinity; setPublicationChecking(false) }
      else start()
    }
    window.addEventListener('focus', start)
    document.addEventListener('visibilitychange', visibility)
    start()
    return () => { disposed = true; stop(); window.removeEventListener('focus', start); document.removeEventListener('visibilitychange', visibility) }
  }, [pendingPublication, checkCycle])

  useEffect(() => {
    const controller = new AbortController()
    void loadEdition(controller.signal).then((current) => {
      if (controller.signal.aborted) return
      const resetting = skipRestore.current
      let saved: Draft | null = null
      if (!resetting) {
        try { saved = restoreDraft(localStorage.getItem(DRAFT_KEY)) } catch { /* Storage is optional. */ }
      }
      skipRestore.current = false
      acceptLoaded(current)
      setLoadError('')
      saveDraft(saved ?? createDraft(current))
      if (resetting) clearPublication()
      setRefreshing(false)
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load this edition. Try again.')
        setRefreshing(false)
      }
    })
    return () => controller.abort()
  }, [reload])

  function saveDraft(next: Draft) {
    setDraft(next)
    setCopyState('')
    setFallback('')
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
      setStorageState(hasChanges(next) ? 'Draft saved on this device.' : 'No unpublished changes.')
    } catch { setStorageState('Draft could not be saved on this device. Keep this tab open or download a backup.') }
  }

  const changed = draft ? hasChanges(draft) : false
  const additionalEdits = Boolean(draft && pendingPublication && !draftMatchesPublication(draft, pendingPublication))
  const unpublishedLocalChanges = publicationResult?.kind === 'live' ? additionalEdits : changed
  useEffect(() => {
    if (!unpublishedLocalChanges) return
    function protect(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [unpublishedLocalChanges])

  function resetToCurrent() {
    if (unpublishedLocalChanges && !window.confirm('Discard this device’s draft and load the latest published edition? Download a backup first if you need to keep it.')) return
    skipRestore.current = true
    setLoadError('')
    setRefreshing(true)
    setReload((value) => value + 1)
  }

  async function copyCorrection() {
    if (!draft || !loaded) return
    setCopying(true)
    setCopyState('')
    try {
      const current = await loadEdition()
      acceptLoaded(current)
      if (current.sha256 !== draft.base.sha256) {
        setCopyState('The published edition changed. Your draft is kept here. Download a backup, then load the latest edition before publishing.')
        return
      }
      const payload = prepareCorrection(draft, editorialToday().iso)
      setFallback(payload)
      const target = pendingFromCorrection(payload)
      pendingPublicationRef.current = target
      setPendingPublication(target)
      setPublicationResult(null)
      try { localStorage.setItem(PUBLICATION_KEY, JSON.stringify(target)); setPublicationStorageWarning('') }
      catch { setPublicationStorageWarning('Progress tracking could not be saved on this device. Keep this tab open to confirm publication.') }
      try {
        await navigator.clipboard.writeText(payload)
        setCopyState('Correction copied. Copying alone does not publish; complete the GitHub steps below.')
      } catch { setCopyState('Automatic copying is unavailable. Select and copy the correction below, then continue to GitHub.') }
    } catch (error) { setCopyState(error instanceof Error ? error.message : 'Unable to prepare this correction. Try again.') }
    finally { setCopying(false) }
  }

  function downloadBackup() {
    if (!draft) return
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `edition-draft-${draft.base.date}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const stale = Boolean(draft && loaded && draft.base.sha256 !== loaded.sha256)
  const errors = draft ? draftErrors(draft, editorialToday().iso) : {}
  const activeIndex = NEWS_TYPES.indexOf(active)
  const item = draft?.edition.items[activeIndex]
  const sourceOriginal = draft?.original.items[activeIndex].source?.url
  const originalLink = sourceOriginal ? safeSource(sourceOriginal) : null
  let preparationError = ''
  if (draft && changed && !Object.keys(errors).length) {
    try { prepareCorrection(draft, editorialToday().iso) } catch (error) { preparationError = error instanceof Error ? error.message : 'Check this correction.' }
  }
  const canCopy = Boolean(draft && changed && !stale && !refreshing && !Object.keys(errors).length && !preparationError)

  function updateItem(update: (current: NewsItem) => NewsItem) {
    if (draft) saveDraft({ ...draft, edition: { ...draft.edition, items: draft.edition.items.map((story) => story.type === active ? update(story) : story) as Draft['edition']['items'] } })
  }

  function updateSource(field: 'name' | 'url' | 'publishedAt', value: string) {
    updateItem((current) => ({ ...current, source: { name: '', url: '', ...current.source, [field]: value } }))
  }

  function inputProps(field: string) {
    const id = `editor-${active}-${field}`
    return { id, 'aria-invalid': Boolean(errors[`${active}.${field}`]), 'aria-describedby': errors[`${active}.${field}`] ? `${id}-error` : undefined }
  }

  const preview = item ? { ...item, source: item.source && safeSource(item.source.url) ? { ...item.source, publishedAt: item.source.publishedAt && !errors[`${active}.sourceDate`] ? item.source.publishedAt : undefined } : undefined } : null

  return <div className="editor-page">
    <header className="editor-header">
      <div><h1>Edition editor</h1><p>Review the source. Make the correction. Publish through GitHub.</p></div>
      <a href="#/">Return to reading</a>
    </header>
    <main className="editor-main">
      <p className="editor-access">Only the repository owner can publish. This tool prepares a draft; GitHub checks your account before changing the live articles.</p>
      <AutomationStatus edition={loaded?.edition ?? null} />
      {!draft || !loaded ? <section className="editor-load" aria-live="polite">
        {loadError ? <><h2>Unable to load the edition</h2><p>{loadError}</p><button type="button" onClick={() => { setLoadError(''); setReload((value) => value + 1) }}>Try again</button></> : <><h2>Loading the published edition</h2><p>Reading the latest stories and their sources…</p></>}
      </section> : <>
        <section className="editor-edition" aria-label="Edition details">
          <div><h2>{formatEditionDate(draft.base.date)}</h2><p>Published revision {draft.base.revision} → correction {draft.base.revision + 1}. The edition date stays unchanged.</p></div>
          <button type="button" disabled={copying || refreshing} onClick={resetToCurrent}>{refreshing ? 'Loading latest edition…' : 'Load latest edition'}</button>
        </section>
        {loadError ? <p role="alert" className="editor-notice">{loadError}</p> : null}
        {stale && publicationResult?.kind !== 'live' ? <aside className="editor-notice" role="alert"><h2>Published edition changed</h2><p>This draft belongs to an earlier version and cannot be published. Your edits are kept here. Download a backup before loading the latest edition.</p><button type="button" onClick={downloadBackup}>Download draft backup</button></aside> : null}
        <div className="editor-story-tabs" role="group" aria-label="Choose a story">
          {NEWS_TYPES.map((type) => <button type="button" key={type} aria-pressed={active === type} onClick={() => setActive(type)}>{labels[type]}{Object.keys(errors).some((key) => key.startsWith(`${type}.`)) ? <span className="editor-tab-error"> · Check fields</span> : null}</button>)}
        </div>
        <div className="editor-view-tabs" role="group" aria-label="Choose editor view">
          <button type="button" aria-pressed={view === 'edit'} onClick={() => setView('edit')}>Edit story</button>
          <button type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Preview story</button>
        </div>
        <div className={`editor-workspace editor-view-${view}`}>
          <fieldset disabled={copying || refreshing} className="editor-form" aria-label={`Edit ${labels[active]}`}>
            <div className="editor-section-heading"><h2>{labels[active]}</h2>{originalLink ? <a href={originalLink} target="_blank" rel="noopener noreferrer">Open original source<span className="sr-only"> (opens in a new tab)</span></a> : null}</div>
            {item ? <>
              <Field label="Headline" id={`editor-${active}-headline`} error={errors[`${active}.headline`]} hint={`${item.headline.length}/30 characters`}><input {...inputProps('headline')} value={item.headline} onChange={(event) => updateItem((story) => ({ ...story, headline: event.target.value }))} /></Field>
              {item.summaries.map((summary, index) => <Field key={index} label={`Summary ${index + 1}`} id={`editor-${active}-summary${index}`} error={errors[`${active}.summary${index}`]}><textarea {...inputProps(`summary${index}`)} rows={3} value={summary} onChange={(event) => updateItem((story) => ({ ...story, summaries: story.summaries.map((line, position) => position === index ? event.target.value : line) }))} /></Field>)}
              <Field label="Editor’s note" id={`editor-${active}-editorNote`} error={errors[`${active}.editorNote`]}><textarea {...inputProps('editorNote')} rows={3} value={item.editorNote} onChange={(event) => updateItem((story) => ({ ...story, editorNote: event.target.value }))} /></Field>
              <div className="editor-source-fields"><h3>Original reporting</h3>
                <Field label="Source name" id={`editor-${active}-sourceName`} error={errors[`${active}.sourceName`]}><input {...inputProps('sourceName')} value={item.source?.name ?? ''} onChange={(event) => updateSource('name', event.target.value)} /></Field>
                <Field label="Article URL" id={`editor-${active}-sourceUrl`} error={errors[`${active}.sourceUrl`]}><input {...inputProps('sourceUrl')} type="url" value={item.source?.url ?? ''} onChange={(event) => updateSource('url', event.target.value)} /></Field>
                <Field label="Original publication date" id={`editor-${active}-sourceDate`} error={errors[`${active}.sourceDate`]} hint="Optional. Keep the source’s original date."><input {...inputProps('sourceDate')} type="date" max={draft.base.date} value={item.source?.publishedAt ?? ''} onChange={(event) => updateSource('publishedAt', event.target.value)} /></Field>
              </div>
            </> : null}
          </fieldset>
          <section className="editor-preview" aria-label="Live story preview"><h2>Reader preview</h2><p className="editor-hint">Your draft as it will appear to readers.</p>{preview ? <article className="editor-preview-article"><StoryBody item={preview} fillHeight={false} /></article> : null}</section>
        </div>
        <section className="editor-publish" aria-labelledby="editor-publish-title">
          <div><h2 id="editor-publish-title">Publish this correction</h2><p role="status" className="editor-storage">{publicationResult?.kind === 'live' && additionalEdits && storageState === 'No unpublished changes.' ? 'Local edits differ from the published correction.' : storageState}</p></div>
          <label className="editor-review"><input type="checkbox" disabled={copying || refreshing} checked={draft.reviewed} onChange={(event) => saveDraft({ ...draft, reviewed: event.target.checked })} /><span>I have checked all three stories and their sources. Mark this edition editor-reviewed.</span></label>
          {errors.edition ? <p role="alert" className="editor-error">{errors.edition}</p> : null}
          {Object.keys(errors).length ? <p className="editor-error">Check the marked fields in each story before continuing.</p> : null}
          {preparationError ? <p role="alert" className="editor-error">{preparationError}</p> : null}
          <ol className="editor-steps"><li>Copy the correction below.</li><li>Open the GitHub publisher and sign in as the repository owner.</li><li>Choose <strong>Run workflow</strong>, paste into <strong>correction</strong>, and run. Wait for the deployment to finish.</li></ol>
          <div className="editor-actions"><button className="editor-primary" type="button" disabled={!canCopy || copying} onClick={() => void copyCorrection()}>{copying ? 'Checking the latest edition…' : 'Copy correction'}</button><a className="editor-button" href={PUBLISHER_URL} target="_blank" rel="noopener noreferrer">Open GitHub publisher<span className="sr-only"> (opens in a new tab)</span></a><button type="button" onClick={downloadBackup}>Download draft backup</button></div>
          {pendingPublication ? <PublicationStatus pending={pendingPublication} result={publicationResult} checking={publicationChecking}
            additionalEdits={additionalEdits}
            storageWarning={publicationStorageWarning} disabled={copying || refreshing}
            onCheck={() => setCheckCycle((value) => value + 1)} onLoad={resetToCurrent} /> : null}
          {copyState && publicationResult?.kind !== 'live' && publicationResult?.kind !== 'different' ? <p role="status" className="editor-copy-status">{copyState}</p> : null}
          {fallback && publicationResult?.kind !== 'live' && publicationResult?.kind !== 'different' ? <details className="editor-copy-fallback" open={copyState.startsWith('Automatic')}><summary>Correction to paste into GitHub</summary><label htmlFor="editor-correction">Prepared correction</label><textarea id="editor-correction" ref={fallbackRef} readOnly rows={5} value={fallback} onFocus={(event) => event.target.select()} /><button type="button" onClick={() => { fallbackRef.current?.focus(); fallbackRef.current?.select() }}>Select correction</button></details> : null}
          <p className="editor-hint">Copying does not publish. If another edition or correction is saved first, GitHub rejects the older draft. Reload the current edition and reapply your edits.</p>
        </section>
      </>}
    </main>
  </div>
}
