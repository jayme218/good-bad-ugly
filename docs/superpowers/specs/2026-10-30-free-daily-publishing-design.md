# Free daily automatic publishing

## User requirements

- Collect articles from several fields and prepare three stories automatically.
- Publish as soon as the daily draft passes checks, without waiting for review.
- The owner can review and correct the published stories afterward.
- No paid APIs, paid AI inference, subscriptions, or automatically purchased resources.
- Keep the existing English React/Vite reading interface and Good/Bad/Ugly ritual.

## Implementation defaults — approved by user

The user approved this design in the conversation. The following defaults govern implementation:

1. Run once daily around 07:17 America/Chicago, with a manual rerun option. Scheduled execution is best effort, not a punctual publication guarantee.
2. Use public GitHub standard Linux runners and GitHub Pages on the existing public repository. This supplies a free automatic publishing path independent of Vercel's account plan or bot-commit deployment eligibility. The existing Vercel site need not be removed. Enabling Pages and the workflow will be an explicit setup step after the implementation is tested.
3. Start with a small allowlist of official public sources covering science/space, public health, economic statistics, and consumer protection. Proposed organizations: NASA, CDC, BLS and FTC. Adapters must use documented public feeds/APIs, verify reuse conditions for the text used, and retain links. No unrestricted web scraping, paywall bypass, images or logos.
4. Use deterministic, attributed extractive summaries rather than a hosted LLM. This has no model/API bill. The result is an automatically assembled draft, not independently fact-checked journalism or free-form AI reporting.

## Collection and publication rules

- Fetch bounded recent candidate lists from allowlisted endpoints with timeouts and per-source request limits. Article redirects must stay on allowed HTTPS agency hosts; reject missing or ambiguous dates and future timestamps.
- Use only content obtained from the source. A headline alone is insufficient for a three-bullet story. Retain the original source title, publication date and URL in the editorial record.
- Text excerpts must preserve attribution and uncertainty, especially allegations or preliminary findings. Never convert an agency allegation into a finding of guilt. If a safe complete summary cannot be formed, reject the item.
- Use at most one story per source/topic family in an edition. Assign categories using documented conservative rules: a concrete positive development for Good, a documented adverse development for Bad, and an explicitly attributed misleading practice or institutional contradiction for Ugly. Category assignment is editorial and not proof of factual accuracy.
- Prefer the past 48 hours; allow a clearly dated item up to seven days old. Do not reuse an article selected in the previous 30 days; retain only a compact URL/date ledger for that window. Reject unsuitable articles rather than force a category.
- Require all three categories, three supported nonempty bullets per item, a source, and the existing payload constraints. Keep an audit record of which source passages support the excerpts. Avoid invented editor opinions: automated editorial notes identify the source and limits of the draft.
- If fewer than three eligible items remain, retain the last published edition, report the skipped run and allow manual rerun. A daily attempt is scheduled; neither punctual execution nor a daily new edition is guaranteed.
- Validate payloads and run checks before deployment. Failures never relabel the old edition with today's date.
- Publish a visible, restrained “Automatically prepared · not yet editor-reviewed” notice for automated drafts. Do not label them “verified.”

## Data and editing

- Keep `src/data/today.json` as the owner-editable current edition. The workflow commits only a validated new edition and its compact editorial record; its date is the Chicago publication date.
- Add optional revision and review-status metadata with backward compatibility for existing fixtures. Include the original source publication date in attribution. The automatic notice is controlled by review status.
- Do not overwrite a current-day edition during retries. A manually edited edition is authoritative for the day. Serialize automated publishing and recheck the latest branch before committing; never force-push or replace concurrent owner edits.
- Editing afterward: open the current JSON in GitHub, correct the text and sources, increment revision, and optionally mark it editor-reviewed. A push deploys the correction; manual review is never a prerequisite for the initial automatic publication.
- Extend the app's update detector to offer a higher revision on the same date as a correction. Lower/equal revisions and older editions are ignored. No correction replaces text during reading; the reader explicitly selects the update.
- Key reading-view identity by edition and revision while preserving date-based opened storage unless tests show an inconsistency. Scroll positions from a different revision must not restore into changed text. Avoid carrying stale pending revisions across explicit switches.

## Hosting, cost and access

- No service keys or billing setup are required for the proposed public-source/extractive version.
- Use only standard public-repository runners, no large runners or paid model calls. Avoid optional caches and raw article collections. Keep the Pages build artifact only as required for deployment with one-day retention; do not add persistent large workflow artifacts. Normal repository content remains public.
- GitHub Pages must be enabled with GitHub Actions as its source. Use narrowly scoped workflow permissions for repository writes and Pages deployment, with deployment limited to the default branch.
- Generate the existing `edition.json` from the same source JSON. Build with the correct Pages base path, so the update endpoint and assets work at `/good-bad-ugly/`.
- The daily workflow must explicitly deploy the generated build; do not rely on a bot commit starting another workflow. Manual content edits must also trigger the publishing build.
- Track schedule failures through GitHub Actions run status and allow manual dispatch. Document re-enabling schedules if GitHub disables them after repository inactivity. No external messaging integrations or new user accounts.
- Free-tier terms and limits can change. The implementation must not automatically upgrade or incur charges. Repository privacy or hosting-plan changes require rechecking the assumptions.

## Verification before enabling

- Fixture-based tests cover RSS/Atom parsing, malformed markup, bad URLs/redirects, missing/future dates, unsupported summaries, source attribution, duplicate articles, category shortages and deterministic selection.
- Publishing tests cover no-overwrite retries, concurrent owner edits, correct Chicago day including DST, and no publication on validation failure.
- Frontend tests cover automated/reviewed notices, source dates, same-day higher-revision updates, explicit correction acceptance and scroll isolation.
- Existing app tests, lint and production build pass. Verify emitted `edition.json` and subpath asset URLs. Inspect workflow permissions and actions pinned to reviewed versions.
- Run a live collection in dry-run mode first. Show candidate sources, exclusions, and resulting draft without committing it or deploying. A successful dry run must demonstrate usable source content rather than only fixture success.
- Only after this evidence, enable the remote schedule/deployment. Report the actual live URL and first workflow result; distinguish configured from successfully running.

## Boundaries

No full-text republication, independent fact-checking guarantee, paid fallback, accounts, archive/feed UI or topic personalization. No news content is fabricated to satisfy the three-story format. Broader source coverage and higher-quality generative editing require a later deliberate change, not a silent paid dependency.
