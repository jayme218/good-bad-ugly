# Owner Automation Status Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. The user approved implementation of the status feature in chat; continue through verification.

**Goal:** Make collection outcomes and publishing problems understandable from the edition editor.

**Architecture:** A sanitized collector report is committed on write-mode collections, including skips. The editor reads that report and public GitHub Actions evidence independently, then shows the live edition separately.

**Tech Stack:** Existing Python standard library, React, TypeScript, Vitest, and GitHub Actions; no new packages.

**Spec:** `docs/superpowers/specs/2026-11-10-automation-status-design.md`

## Global Constraints

- Preserve reader behavior, editing drafts, owner-only publication, and branch-race protection.
- No paid services, credentials in browser code, automatic retries, or anonymous write actions.
- Prepared collection is not proof of publication; unchecked source counts are null.

## Review Focus

- A newer failed run must remain visible beside an older report.
- Manual dry runs and correction deployments must not impersonate collections.
- Skip/report-only commits must not overwrite edition files or race owner changes.
- Malformed, future, stale, missing, or rate-limited evidence must remain unknown.
- Mobile details must not obstruct editing or overflow.

## Tasks

- [x] Backend worker: add failing tests for sanitized reports and skip/dry-run invariants; implement collector codes/report generation and guarded report-only workflow commits; run Python tests; update publishing docs.
- [x] Frontend worker: add failing tests for evidence parsing and precedence; implement `automation.ts`, `AutomationStatus.tsx`, scoped CSS and editor integration; run focused tests.
- [x] Integrator: run full tests/lint/Pages build, verify emitted assets, and exercise public API compatibility without triggering publication.
- [x] Independent reviewer: inspect the complete diff, workflow permissions/concurrency, data truth, and async cleanup; resolve material findings.
- [x] Capture desktop/mobile shortage, source details, failure, rate-limit and first-report states; run design detector and documenter comparison. Finish review precedes delivery.
- [ ] Commit and update GitHub under the user's standing instruction.

## Verification

159 Vitest tests and 65 Python tests passed. Lint, Pages-subpath build and whitespace checks passed. The independent code review passed after regression fixes for non-string report enums, unknown workflow conclusions, manual dry-run masking, and rerun ordering. The real public GitHub API loaded without credentials in the browser. Source diagnostics and collection failures were also exercised with isolated fixtures; no fixture report was published. Existing design records remain sufficient.
