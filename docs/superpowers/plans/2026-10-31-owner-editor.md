# Owner Editor Implementation Plan

> **For agentic workers:** Use task ownership below and separate verification before final claims.

**Goal:** Free form-based owner corrections with safe GitHub publication and a stronger headline face.
**Architecture:** Lazy static editor, raw-edition hash conflict guard, owner-only dispatch correction job, reusable Pages deployment.
**Tech Stack:** Existing React/TypeScript/Vite, Python stdlib, GitHub Actions. No new application dependency.
**Spec:** docs/superpowers/specs/2026-10-31-owner-editor-design.md

## Global Constraints
Only owner can publish; no paid service; preserve reader flow/date; increment revisions; never overwrite concurrent content; copy is not publication; no browser credentials.

## Review Focus
Stale local drafts, changed published editions, Unicode fields, partial clipboard support, nonowner dispatch, bot commit deployment.

### Task 1: Typography
- [x] Replace Instrument Serif with self-hosted Archivo Narrow and OFL attribution; preserve reader behavior.
- [x] Inspect mobile/desktop heading wraps and fallback.

### Task 2: Owner correction pipeline
- [x] Tests first for envelope validation/hash/date/revision/noop/source constraints.
- [x] Implement Python correction validator and owner-only workflow.
- [x] Add workflow_call to existing publisher and prevent collection on reusable invocation.
- [x] Verify workflow permissions, race handling and explicit Pages deployment.

### Task 3: Editor
- [x] Test hash/envelope/validation/local recovery helpers.
- [x] Implement accessible forms, source links, tabs/preview, review checkbox, copy/publish instructions.
- [x] Lazy #/editor route with loading/error boundary; preserve reader route.
- [x] Verify desktop/mobile and stale/copy errors.

### Task 4: Integrate and verify
- [x] Run Python/Vitest/lint/subpath build; inspect screenshots and mechanical detector once.
- [x] Independent code/security/UI review, fix material findings.
- [x] Update operator docs and prepare production verification without changing real article copy.

Release gate: push to GitHub and verify the actual Pages workflow and live assets.

## Evidence

101 Vitest and 41 Python tests passed. Lint and Pages subpath build passed. Browser checks at 1440×1100 and 390×844 covered live typography, fields, reload/local draft restore, invalid input, story tabs, mobile preview, clipboard fallback, stale draft rejection and explicit reset; no runtime errors or horizontal overflow. The browser-generated envelope passed the Python validator against the unchanged real edition. Independent security review found no authorization blocker. Screenshot review requested removal of two decorative external-link glyphs; accessible new-tab text replaces them. Remote deployment verification follows the final push.
