# Publishing an edition

Automatic unreviewed draft publication is available after source testing and setup; see [AUTOMATION.md](AUTOMATION.md). This page covers manual publication and correction.

The app bundles `src/data/today.json` at build time and emits the same content as `edition.json`. Publish a new build for each edition; changing the calendar date does not create new stories. There is only one content file to maintain.

On initial load and when readers return to the tab, the app checks `edition.json` for a valid, newer, already-published edition. It keeps the current stories until the reader selects “Read new edition.” The notice appears on the overview, leaving an open mobile/tablet story uninterrupted. Offline, invalid, same-date, older, or future-dated responses do not replace the active edition.

## Prepare

1. Choose the edition's calendar date in `America/Chicago`. Keep that date unchanged if publication is delayed; never relabel old stories as today's edition.
2. Provide exactly one `good`, one `bad`, and one `ugly` item. Each needs a headline of at most 30 characters, three summary bullets, and an editorial note.
3. Verify each factual claim against its original reporting or primary source. Add a `source` object with the source's `name` and absolute HTTP(S) `url`. A syntactically valid link does not verify a claim.
4. Keep editorial interpretation in `editorNote`, separate from the factual summary. Explain why the event matters without adding unsupported claims.

Existing stories without a source remain readable with “Source not provided.” They are not ready for a public news launch until their claims are verified and genuine source links are supplied. Do not invent citations or substitute a publisher homepage for the relevant article.

## Validate and publish

Run each command and resolve failures before proceeding:

```sh
npm test
npm run lint
npm run build
```

Preview the three stories on desktop and mobile. Check dates, source destinations, editorial labels, next-story navigation, and the end message. Then commit the content change and push to the configured deployment branch. Confirm the production deployment actually shows the new edition and its `edition.json` matches; a successful push alone is not deployment verification. Also return to a tab running the previous edition and confirm that the update notice offers the new edition without changing its current reading content.

The optional scheduled attempt is 07:17 America/Chicago and can be delayed or skipped. Do not promise a new edition every day: sources and conservative selection may be insufficient. The automation remains disabled until live collection succeeds and the repository variable is enabled.

For a correction to an already published edition, keep its date and increase `revision` (absent means zero). Set `reviewStatus` to `reviewed` only after review. Include each original article's publication date as `source.publishedAt` in YYYY-MM-DD form. A higher revision is offered to existing readers as a correction; it never interrupts their open story.

## If publication is delayed

The last available edition remains readable with its actual date and a notice that today's edition is unavailable. Its opened state remains attached to that edition, even on another calendar day. A future-dated or invalid edition is not shown as a published edition. Readers can refresh to load a newly deployed build.

Do not change the date merely to remove the notice. Prepare, verify, and deploy a genuinely new edition.
