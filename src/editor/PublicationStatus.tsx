import { formatEditionDate } from '../timezone'
import type { PendingPublication, PublicationResult } from './publication'

export function PublicationStatus({ pending, result, checking, additionalEdits, storageWarning, disabled, onCheck, onLoad }: {
  pending: PendingPublication; result: PublicationResult | null; checking: boolean; additionalEdits: boolean;
  storageWarning: string; disabled: boolean; onCheck: () => void; onLoad: () => void;
}) {
  let title = 'Correction prepared'
  let message = 'This correction is not published by copying. Complete the GitHub steps, then return here to check the live site.'
  if (checking) { title = 'Checking the live site'; message = 'Comparing the published date, revision and all three stories with your prepared correction.' }
  else if (result?.kind === 'waiting') { title = 'Not live yet'; message = 'The live site still shows an earlier version. GitHub may still be deploying. Check the workflow if it is taking longer than expected.' }
  else if (result?.kind === 'live') { title = 'Your correction is live'; message = 'The published date, revision and story content match your prepared correction.' }
  else if (result?.kind === 'different') { title = 'A different version is live'; message = 'The published edition does not match this correction. Your edits are kept here. Download a backup before loading the current edition.' }
  else if (result?.kind === 'error') { title = 'Unable to verify publication'; message = 'The live edition could not be checked. Your edits are kept here. Check your connection and try again.' }
  return <section className="editor-publication-status" aria-label="Publication status">
    <div role="status" aria-live="polite" aria-atomic="true">
      <h3>{title}</h3><p>{message}</p>
      <p className="editor-hint">{formatEditionDate(pending.edition.date)} · revision {pending.edition.revision}</p>
      {result?.kind === 'live' && additionalEdits ? <p>Additional changes on this device are not published. Download a backup before loading the published correction.</p> : null}
    </div>
    <div className="editor-actions">
      <button type="button" disabled={disabled || checking} onClick={onCheck}>Check publication</button>
      {result?.kind === 'live' ? <button type="button" disabled={disabled || checking} onClick={onLoad}>Load published correction</button> : null}
    </div>
    {storageWarning ? <p className="editor-hint">{storageWarning}</p> : null}
  </section>
}
