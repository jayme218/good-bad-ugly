# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Readers open three daily Good/Bad/Ugly news cards, including on mobile. The repository owner reviews and corrects automatically published editions. Only the owner may publish corrections through the editing workflow.

## Product Purpose
A finite daily news reading ritual: read three stories, then leave. The owner needs readable editing fields and an accurate preview instead of editing JSON by hand.

## Operating Context
React/Vite on public GitHub Pages, existing public repository jayme218/good-bad-ugly. Daily collection uses free public agency feeds and attributed excerpts. Publication is automatic; owner review follows. src/data/today.json is authoritative; revision distinguishes corrections.

## Capabilities and Constraints
No paid APIs, hosted model charges, or purchased infrastructure. Preserve the reader card-opening interaction. Do not silently replace an open story. Corrections preserve the edition date and increase revision. Source claims and allegations must remain attributed. The owner authorizes implementation choices and asked for comparison of multiple editing approaches.

## Brand Commitments
The existing reader uses English copy, monochrome surfaces and thin borders. The user requested replacing the overused Instrument Serif title face; Archivo Narrow is the implementation choice for headings.

## Product Principles
- Keep reading finite and simple.
- Distinguish automatic preparation from human review.
- Make edits understandable and protect concurrent owner changes.
- Separate preparing a draft from publishing it.

## Evidence on Hand
Real current edition, extraction audit and recent-article ledger. docs/PRD.md describes the reader; docs/AUTOMATION.md records free publication.
