# Free automatic publishing

## What this does

The collector uses allowlisted public agency feeds and source text. It extracts and attributes complete source sentences without a paid news API or hosted language model. Good/Bad/Ugly are conservative editorial categories; an automatically prepared edition is not independently fact-checked journalism.

An eligible draft is published without waiting for owner review. If source access, freshness, category matching, or supporting text is insufficient, no new edition is written. The previous edition keeps its real date. New articles every day are not guaranteed.

Source endpoints and reuse references are in `scripts/news_sources.json`. NASA collection reads three bounded feed pages (up to 30 recent entries), and BLS includes metropolitan employment and workplace injury releases. Short feed teasers are checked against a scoped article body before final classification; article requests remain capped at six per source. The run reports rejected sources/candidates; the current editorial record retains source titles, timestamps and exact supporting passages. The duplicate ledger is limited to the previous 30 days. No images or logos are copied. Bad headlines use a short factual template matched to an adverse statement actually included in the displayed excerpts, while the original title stays in the editorial record. Incomplete quotation fragments and promotional warning roundups are excluded.

## Local checks

```sh
npm run news:test
npm run news:preview
npm test
npm run lint
npm run build -- --base=/good-bad-ugly/
```

`news:preview` never modifies the publishing files. Its JSON result must say `draft` and contain three actual supported stories before activating automatic publishing. `skipped` is an honest nonpublication outcome, not proof that a working edition was produced. Network access may differ between a local machine and the GitHub runner; use the manual dry-run workflow to test the latter.

`npm run news:generate` writes a validated eligible draft to `src/data/today.json`, plus the compact editorial record and recent-article ledger. It does not overwrite an edition whose date is today or later. Local generation alone does not deploy anything.

## Initial setup

The repository must remain public to use free standard GitHub-hosted runner compute. Use only the standard Ubuntu runner and included Pages service; no paid API, large runner, optional cache, or paid fallback is configured. Pages deployment artifacts have one-day retention. Free-tier limits and terms still apply; no upgrade is performed automatically.

1. Push the tested implementation to `main`.
2. Open GitHub **Actions → Daily edition and Pages → Run workflow**. Leave `dry_run` selected. Verify the report says `draft` and inspect all three excerpts and sources. This run does not commit or deploy.
3. Enable **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site URL is `https://jayme218.github.io/good-bad-ugly/`; the existing Vercel site is not removed.
4. Under **Settings → Secrets and variables → Actions → Variables**, add repository variable `DAILY_PUBLISHING_ENABLED` with value `true` only after the live dry run succeeds. No API secret is required.
5. Run the workflow with `dry_run` unchecked and verify the deployment job and live site's `edition.json`. A push or a configured schedule is not proof of a successful deployment.

The scheduled attempt is 07:17 in `America/Chicago`, including daylight saving changes. GitHub can delay or skip scheduled runs and can disable public-repository schedules after inactivity. Check Actions for failures, use manual dispatch to retry, and re-enable a disabled workflow in Actions.

Without `DAILY_PUBLISHING_ENABLED=true`, the manual dry run is available but automatic collection and deployment remain disabled. Set the variable to `false` to stop future automatic runs. Do not activate the service merely to hide source failures.

## Edit after publication

Open `src/data/today.json` in GitHub and edit the text or source. Keep the edition's original `date` and `timezone`, increase `revision` by one, and set `reviewStatus` to `reviewed` when the edition has actually been reviewed. For example, change revision 0 to 1. Keep headlines within 30 characters and exactly three summary bullets per story.

Commit the edit to `main`. The enabled workflow validates and deploys the corrected version. Readers already in the app are offered an updated edition on return; the current article is not silently replaced. Higher revisions have separate scroll positions while opened state stays attached to the edition date.

The daily generator will not replace current-day owner edits. A branch change during generation rejects the non-forced publishing push; rerun from the owner's latest version. Never resolve this by force-pushing over an edit.

Do not mark an edition reviewed merely to remove its automatic-draft notice. The editorial record describes the original extraction; after corrections, keep corrected sources accurate and explain substantive corrections in the commit message.
