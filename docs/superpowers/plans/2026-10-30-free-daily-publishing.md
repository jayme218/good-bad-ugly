# Free Daily Publishing Implementation Plan

> **For agentic workers:** Use subagent-driven development; preserve concurrent edits. The owner subsequently authorized committing and pushing the completed, reviewed implementation.

**Goal:** Free automated daily publication with subsequent owner corrections.
**Architecture:** A standard-library Python collector builds an attributed extractive edition from allowlisted public feeds. GitHub Actions validates and commits a daily edition then explicitly deploys Pages. The app supports revision-aware update notices and automated-draft labels.
**Tech Stack:** Existing React/Vite/TypeScript/Vitest; Python 3 stdlib; GitHub Actions and Pages.
**Spec:** `docs/superpowers/specs/2026-10-30-free-daily-publishing-design.md` (approved).

## Global constraints

- No paid APIs/models/services, no secrets required, no fabricated filler stories.
- Exactly three supported stories or no change to the last published edition.
- Preserve owner's same-day edits; no force pushes or automatic main-branch overwrite.
- Article publication dates and source links must remain visible; automatic drafts are not fact-check certification.

## Shared interfaces

- Optional `Edition.revision`: nonnegative safe integer, absent means 0.
- Optional `Edition.reviewStatus`: `automated` or `reviewed`.
- Optional `source.publishedAt`: valid YYYY-MM-DD calendar date.
- Collector command: `python3 scripts/daily_news.py --dry-run --output <path>`; `--write` updates current edition and compact record/30-day ledger only after validation. Same Chicago day returns without overwriting.
- App update helper preserves existing call compatibility, accepting current revision as an additional optional argument.
- Reading positions: revision 0 retains existing date key; later revisions use an edition/revision key. Opened remains date-based.

## Review focus

- Unsupported excerpts and misleading allegations: fixture tests reject unsafe candidates and preserve source wording.
- Dates and freshness: UTC/Chicago rollover, future timestamps and stale candidates tested.
- Same-day manual edits and race: no-overwrite generation; workflow commits must fail safely if remote changed.
- Corrections: higher revision offered explicitly, no overwrite while reading, changed-text scroll isolation tested.
- Hosting: subpath asset/edition endpoint parity and restricted workflow permissions validated before enablement.

### Task 1: Collector and publisher boundary

Files: new `scripts/daily_news.py`, `scripts/test_daily_news.py`, fixtures and `scripts/news_sources.json`.
- [ ] Write failing fixture tests for feed parsing, URL allowlists, extraction, freshness, category shortages, duplicates and same-day no-overwrite.
- [ ] Implement bounded collection, deterministic source-preserving excerpts, compact audit and 30-day history, dry-run and write modes.
- [ ] Run Python tests and a live dry run. Report exclusions and actual eligibility; do not fabricate a successful edition.

### Task 2: Revision-aware app

Files: types/parser/update checks/reading state/notice/header/source display and corresponding Vitest tests.
- [ ] Write failing tests for metadata rejection, same-date revisions, review labels and scroll isolation.
- [ ] Implement shared interfaces; keep old fixtures compatible and explicit switching behavior.
- [ ] Run targeted tests, lint and build; obtain independent source review.

### Task 3: Schedule and Pages

Files: new `.github/workflows/publish.yml`; publication docs and package scripts via parent integration.
- [ ] Define standard free runner jobs for daily collection/manual dispatch and owner push deployment.
- [ ] Serialize publishing; recheck main before non-forced data commit, explicitly build/deploy the resulting revision.
- [ ] Pin official actions to reviewed SHAs, minimal job permissions, one-day Pages artifacts, no optional caches.
- [ ] Test no-data/error paths, subpath production build and emitted edition parity. Enable remote only after successful evidence and authorized implementation push; clearly report setup not running if that step remains.

### Task 4: Integrated review and handoff

- [ ] Run all Python/Vitest checks, lint, build, endpoint parity and whole-change independent review.
- [ ] Document schedule, manual correction/review, retry, failure and free-tier limits.
- [ ] Commit and push the reviewed implementation as authorized; report Pages setup/status and do not claim the schedule is live before a remote workflow succeeds.
