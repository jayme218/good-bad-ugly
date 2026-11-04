# Confirm a correction is live

The user approved the recommended next step: confirm an owner correction after returning from GitHub. Implement only this completion feedback, not a collection dashboard or a new publishing method.

Preserve the current reader and owner-only workflow. The editor is public and has no publishing credentials. Do not label a clipboard operation or an unobserved GitHub save as live publication. Use only the public deployed edition.json, with no paid service or extra authentication.

When a correction is prepared for copying (including manual clipboard fallback), retain an immutable snapshot of its exact normalized target edition, base date/revision/hash and preparation time. Persist that small record locally under gbu:editor:publication, separately from the editable draft; handle unavailable storage. Reloading may restore the pending target but must not restore a success claim from storage.

On initial restoration, visible tab return/focus, and explicit Check publication, fetch the live edition with cache:no-store and compare exact date, revision and semantic content: headline, all three summaries, editorial note, source fields and review status. Object-key order and JSON formatting do not matter. Equal identity with different text, a newer revision, or a newer edition must not count as this correction. An older cached response is waiting, not success. An invalid/future edition or network failure is unable to verify, never success. Do not overwrite editable draft text during checks.

States: correction prepared (not published); checking; waiting for the copied correction; exact correction live; different published version; unable to verify. Do not claim a GitHub save unless observed; this implementation intentionally confirms only the deployed site. Show the prepared target date/revision so the message is specific. If edits were made after copying, a successful check must explicitly say those additional edits remain unpublished. Existing stale-draft protection remains authoritative. Explicit Load latest / Load published correction may reset the draft with the existing discard protection; background checks never clear or rebase it.

Reuse the incumbent white/black, sharp-corner, thin-border editor styles. English product copy, visible keyboard focus, mobile 44px actions and a polite status announcement. Add only a compact publication status area in the existing publication section. No decorative icons, new page, modal or reader navigation.

Perform coalesced, abortable checks. Poll only while visible and waiting, at most six checks spaced ten seconds per visible-return/manual-check cycle. Stop after the bounded window or terminal outcome; keep an explicit retry. Hidden/unmounted editors must not continue polling. A newly prepared snapshot cancels/disposes the old checker so delayed results cannot confirm the wrong draft.

Core contract (new src/editor/publication.ts):
- PUBLICATION_KEY string; PendingPublication {version:1, base:{date,revision,sha256}, edition:Edition, preparedAt:string}.
- pendingFromCorrection(payload:string, preparedAt?:string): PendingPublication (throw for invalid payload).
- restorePublication(raw:string|null): PendingPublication|null.
- publicationOutcome(pending:PendingPublication, current:LoadedEdition): 'live'|'waiting'|'different'.
- draftMatchesPublication(draft:Draft, pending:PendingPublication): boolean; compare the normalized prepared correction without mutating either.
- createPublicationChecker(pending, load:(signal:AbortSignal)=>Promise<LoadedEdition>, onResult:(result:PublicationResult)=>void): {check():Promise<void>, dispose():void}. Result is {kind:'live'|'waiting'|'different',current:LoadedEdition,checkedAt:string} or {kind:'error',checkedAt:string}. Emit errors without raw exception text; ignore disposed results, coalesce in-flight calls.

The UI owns timer/visibility scheduling and checking indicators. Helpers may expose semantic equality internally. Avoid modifying model.ts unless a minimal exported helper materially avoids duplicate logic; coordinate ownership first.

Regression evidence must cover every content field, reordered keys, extra edits after copy, stale/future/malformed responses, failed network, coalescing/disposal and snapshot replacement. Browser tests simulate deployed responses without making real article edits: copy then focus/wait, exact success, different content at same revision, subsequent local edits, offline/retry, refresh recovery, no silent draft clearing and mobile overflow. Run all app/Python tests, lint/subpath build, independent review, then push and verify actual Pages artifacts.

## Verification evidence

124 Vitest tests and 52 Python tests passed, alongside lint and the Pages subpath build. Browser tests at 1440×1100 and 390×844 covered exact success, same-revision different content, later local edits and undo to the original, bounded six-check cycles, focus/visibility deduplication, hidden cancellation, offline/retry, reload recovery and explicit load/reset. No runtime errors or horizontal overflow occurred. Deliberate deployed-response simulation did not alter real articles. Independent code review identified the old-request/passive-effect race, resolved with synchronous target identity guards. The warning regression for undoing a published edit was reproduced in both tests and the browser, then fixed. A separate visual review approved the scoped states; design documentation comparison found no global token changes. A pre-existing 0.75rem tab-error typography advisory was preserved outside scope.
