# Free automatic publishing

## What this does

The collector uses allowlisted public agency feeds and source text. It extracts and attributes complete source sentences without a paid news API or hosted language model. Good/Bad/Ugly are conservative editorial categories; an automatically prepared edition is not independently fact-checked journalism.

An eligible draft is published without waiting for owner review. If source access, freshness, category matching, or supporting text is insufficient, no new edition is written. The previous edition keeps its real date. New articles every day are not guaranteed.

Source endpoints and reuse references are in `scripts/news_sources.json`. NASA collection reads three bounded feed pages (up to 30 recent entries), and BLS includes metropolitan employment and workplace injury releases. Short feed teasers are checked against a scoped article body before final classification; article requests remain capped at six per source. The run reports rejected sources/candidates; the current editorial record retains source titles, timestamps and exact supporting passages. The duplicate ledger is limited to the previous 30 days. No images or logos are copied. Bad headlines use a short factual template matched to an adverse statement actually included in the displayed excerpts, while the original title stays in the editorial record. Ugly excerpts must likewise include a specific reported deceptive practice, not only company background or the fact that a complaint exists. Incomplete quotation fragments and promotional warning roundups are excluded.

## Source pool and fallbacks

Seven allowlisted official publishers supply alternative candidates; source access alone does not make an article eligible.

| Category | Sources | Topic families |
| --- | --- | --- |
| Good | NASA, NSF, FDA | Science; health |
| Bad | BLS, BEA | Economy |
| Ugly | FTC, DOJ Office of Public Affairs | Consumer protection; justice |

An edition still uses three different topic families. NASA and NSF share the science family; BLS and BEA share economy. One source failure is reported and collection continues with the others. The diagnostic result includes `sourceCandidates` so an accessible feed with zero eligible articles is distinguishable from a usable fallback.

NSF articles use their exact news-body field. Full-page provenance checks reject externally republished text, including the observed Rubin Observatory repost, even if the RSS teaser already contains three sentences. FDA is limited to its own press announcements and preserves accelerated-approval limitations. Its legacy HTTP article links are upgraded only for the explicit agency host/path allowlist; requests still use HTTPS exclusively. FDA company recall announcements, DOJ videos and non-OPA paths are outside scope.

BEA eligibility requires a supported adverse economic measure, including a reported PCE price-index increase. A stock-index increase, forecast, decrease or unchanged PCE figure does not qualify through that rule. Mixed income/growth context is retained alongside the actual adverse statement.

The feed documentation, reuse policy and content restrictions for each source are recorded in `scripts/news_sources.json`. NIH, NOAA, USGS, NCI, OSHA, CFTC, CFPB and SEC candidates were not enabled during this expansion when current access, freshness, feed availability or article-body evidence was insufficient. No paid fallback or unsupported daily-publication guarantee is introduced.

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

## Collection status

Each completed write attempt also writes `public/collection-status.json`. The versioned public report records the finish time, attempted Chicago edition date, eligible Good/Bad/Ugly counts, candidate counts by source, and aggregate exclusion counts: recently used articles, unavailable requests/feeds, unsuitable material, insufficient supporting evidence, bounded request limits, and feeds without recent usable entries. Raw errors, article URLs and excerpt text stay out of this report. Exclusion counts count events, not unique articles; a feed failure is an event too.

An `already-current` result means the collector deliberately did not fetch sources; candidate and category counts are unknown (`null`), rather than zero. A `prepared` outcome means local content was generated, not that Pages deployed it. A `skipped` outcome keeps the edition, extraction audit and recent-article ledger untouched. There is no sample report committed before a real collection attempt.

The publishing workflow commits the status report even when a shortage prevents a new edition, after verifying the three publishing files stayed unchanged and the remote branch still matches the starting commit. The ordinary build/deploy path then publishes the updated diagnostics alongside the retained edition. Dry runs do not write or commit the report. Exceptions still fail the workflow; a report from an earlier run must not be read as the latest run succeeding. The administrator view also checks public GitHub Actions state so failures before a new report can deploy remain visible. GitHub run IDs and attempt numbers are recorded only when valid; locally generated reports have no workflow identity.

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

Use the [owner edition editor](https://jayme218.github.io/good-bad-ugly/#/editor) for form-based corrections and reader preview. Copy the correction, open the GitHub publisher, and run it as the repository owner. The correction workflow validates the original fingerprint and explicitly reuses the Pages pipeline after its bot commit. See [PUBLISHING.md](PUBLISHING.md) for the exact steps. Copying a correction alone does not publish it.

Direct file editing remains available:

Open `src/data/today.json` in GitHub and edit the text or source. Keep the edition's original `date` and `timezone`, increase `revision` by one, and set `reviewStatus` to `reviewed` when the edition has actually been reviewed. For example, change revision 0 to 1. Keep headlines within 30 characters and exactly three summary bullets per story.

Commit the edit to `main`. The enabled workflow validates and deploys the corrected version. Readers already in the app are offered an updated edition on return; the current article is not silently replaced. Higher revisions have separate scroll positions while opened state stays attached to the edition date.

The daily generator will not replace current-day owner edits. A branch change during generation rejects the non-forced publishing push; rerun from the owner's latest version. Never resolve this by force-pushing over an edit.

Do not mark an edition reviewed merely to remove its automatic-draft notice. The editorial record describes the original extraction; after corrections, keep corrected sources accurate and explain substantive corrections in the commit message.
