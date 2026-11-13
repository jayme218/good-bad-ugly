# Owner automation status

The owner approved a status section in the edition editor: last collection, live edition, reasons a new edition was not published, and links to the GitHub run and daily publisher. Existing reader behavior and owner-only publishing remain unchanged. All services and dependencies remain free.

## Behavior

- Show a compact status section before the editor form, including when the edition cannot load. Put source counts and exclusion totals inside a disclosure.
- The collector writes `public/collection-status.json` only for `--write`. Skips preserve the edition, audit, and article ledger; the workflow may commit the status report alone after the same branch-race check.
- A report records collection, never deployment. Use `prepared`, `skipped`, and `error` outcomes and fixed reason codes. No article text, raw exception, credential, or arbitrary URL belongs in the report.
- `checkedAt` is collection completion in UTC; `editionDate` is the attempted Chicago editorial day. Candidate counts are null when sources were not checked.
- Load public report and workflow evidence independently. A failed or running GitHub run must not be hidden by an older successful report. Ignore push deployments, corrections, and proven manual dry runs when determining the latest collection.
- Show the edition actually loaded from the live site, including its date and revision. Do not invent a publication timestamp or infer publication from workflow success alone.
- Initial load and explicit refresh only, with bounded requests and cancellation. Failed, missing, rate-limited, stale, malformed, or future data must produce honest partial/unknown states. Editing remains available.
- Recovery opens GitHub; it cannot run anything anonymously. Explain that a real collection uses Run workflow with `dry_run` disabled.

## Report contract

Version 1 contains `checkedAt`, `editionDate`, `outcome`, `reason`, `eligible` (Good/Bad/Ugly counts or null), `sources`, and optional `workflow` (`runId`, `runAttempt`). Each source has its configured id/name, candidates or null, and counts for duplicate, unavailable, unsuitable, insufficientEvidence, requestLimit, and noRecentEntries. The frontend validates the public payload and constructs links only from safe numeric run IDs.

## Visual contract

Extend the existing Operate surface: Archivo Narrow headings, Instrument Sans controls/body, black/white, square corners, thin rules, visible keyboard focus, and minimum 44px actions. The summary states what happened and the next useful action; details stay secondary. No new charts, colors, decorative cards, raster assets, or visual identity. On narrow screens actions stack, source labels wrap, and editing remains easy to reach. Native disclosure is the signature interaction; no added motion is needed.

## Acceptance evidence

Collector tests cover report sanitization, skipped and dry-run invariants, and truthful unchecked counts. Frontend tests cover report validation, prepared versus deployed, newer failure versus older report, dry-run exclusion, absent/rate-limited data, and timeout/disposal. Run the complete existing tests, lint, and Pages build. Inspect desktop and mobile, including source disclosure and failure recovery, and obtain independent code and visual reviews.
