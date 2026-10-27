# Publishing an edition

The app bundles `src/data/today.json` at build time. Changing the calendar date does not fetch or create new stories. Publish a new build for each edition.

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

Preview the three stories on desktop and mobile. Check dates, source destinations, editorial labels, next-story navigation, and the end message. Then commit the content change and push to the configured deployment branch. Confirm the production deployment actually shows the new edition; a successful push alone is not deployment verification.

Set a sustainable publication time before promising one to readers. No publication schedule or automatic daily publishing is configured by this change.

## If publication is delayed

The last available edition remains readable with its actual date and a notice that today's edition is unavailable. Its opened state remains attached to that edition, even on another calendar day. A future-dated or invalid edition is not shown as a published edition. Readers can refresh to load a newly deployed build.

Do not change the date merely to remove the notice. Prepare, verify, and deploy a genuinely new edition.
