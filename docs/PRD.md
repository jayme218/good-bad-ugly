# PRD — The Good, The Bad, and The Ugly

## Approved updates (October 2026)

The following user-approved changes supersede conflicting UI, state, and acceptance rules in the original brief below:

- Show the product explanation and category names initially; retain concealed headlines until opened.
- Mobile reading uses explicit back/next controls, scrollable content, and a small Opened indicator on previously opened cards.
- Below 1024px, phones and small tablets use the single-story reader; at 1024px and above, stories open in the three columns. The unopened overview retains three category cards at every width.
- The single-story reader remembers each story's scroll position for the edition in the current tab, including refresh. Unvisited stories start at the top; a new edition has separate positions. If session storage is blocked, reopening still restores positions while the app remains mounted.
- Secondary labels use a 13px floor, editorial notes a 14px floor, and summary text at least 16px. Narrow reading frames use reduced horizontal padding, and the single-story reader is capped at 44rem.
- Display the actual edition date on desktop and mobile. Key opened state by that date; a calendar rollover alone does not reset progress for unchanged content.
- Check the published static `edition.json` on load and visible tab return. Offer newer validated editions with an explicit “Read new edition” action on the overview; never replace stories during reading. Switching initializes the opened and scroll state for the selected edition date.
- If the bundled edition is older than today in Chicago, keep it readable with an explicit unavailable-today notice. Future-dated and invalid editions are unavailable.
- Articles support a named HTTP(S) source link. Missing sources are stated explicitly, and editorial interpretation is labeled Editor's note.
- The end message describes the three stories offered, not proof of having read them or comprehensive news coverage.
- Optional revision and review-status metadata distinguish automatically prepared drafts from reviewed editions. Higher revisions on the same date are explicit corrections; revised text has separate saved scroll positions.
- A free scheduled collector can publish attributed excerpts from approved public sources without prior editorial approval. It must skip publication when three supported distinct-topic stories cannot be selected, and must preserve owner edits. See [AUTOMATION.md](AUTOMATION.md).

Daily publication can be scheduled after live source testing and Pages setup; manual correction remains available. No accounts, feed UI, archives, or external notification system are added.

Feed this document to a coding agent as the source of truth. Do not invent screens, colors, navigation, or extra copy. The reading surface is locked.

---

## 1. Problem Statement

Doomscrolling news never ends; people open a feed and lose an hour. This product gives one person **exactly three curated stories per Chicago calendar day**, then tells them they are done so they can close the tab.

---

## 2. Target User & Core Use Case

**Who:** An English-speaking adult who wants to stay informed without a feed. They bookmark one URL and return at most once a day.

**Primary workflow:**
1. Open the site. See a white page and three empty black-outline boxes. No title, no date, no nav.
2. Click each box. That story appears (desktop: inside the box; mobile: full-screen; tap the story to close).
3. After the third box is opened: title, **Chicago date**, and “You're all caught up for today. You can close this tab now.”
4. Close the tab. Same Chicago day: returning shows progress already made. Next Chicago day: three empty boxes again (new edition).

---

## 3. MVP Must-Have Features

Maximum five. Build only these.

1. **Locked reading ritual (already the UI; do not restyle)**  
   White field, three equal boxes, black 1px borders, no radius, no shadow, no color. Closed boxes are empty (label only via `aria-label`). Hover/focus on an empty box fills it black. After all three are open, reveal masthead + footer. English only.

2. **Chicago-dated edition as the unit of content**  
   “Today” is the calendar date in `America/Chicago` (CST/CDT). Header date and edition id must be that date, never `toISOString()` UTC and never the device locale’s date if it differs. One Good, one Bad, one Ugly per edition.

3. **Opened-state persistence per edition**  
   Remember which of the three boxes are open **on this device, for this edition date only**. Refresh mid-read keeps progress. A new Chicago date wipes state and shows empty boxes.

4. **Current-edition payload**  
   Ship a single current edition (JSON). Validate before use: exactly three items, types `{good, bad, ugly}` once each, `headline` ≤ 30 characters, `summaries.length === 3`, `editorNote` present. Invalid payload must not render a broken grid.

5. **Static production deploy**  
   Vite production build on a public URL (Vercel). Bookmark is the return path. No accounts.

---

## 4. Out of Scope (v2 / Later)

Do not implement. If tempted, stop.

- Any restyle: color, cards with shadows, labels on closed boxes, nav, buttons, share, ads
- Archive, calendar, past-edition URLs, “you missed yesterday”
- Feed, related stories, search, more than three items, expandable full article
- Accounts, comments, likes, streaks, notifications, email, CMS, database
- Mid-day second edition, live ticker, breaking banner
- Korean (or any) localization; timezone picker; multiple editions per day
- Preview text on closed boxes; anything below the footer

---

## 5. Data & State

**Edition (source of truth, static JSON):**

```ts
interface Edition {
  date: string              // YYYY-MM-DD in America/Chicago
  timezone: 'America/Chicago'
  items: [NewsItem, NewsItem, NewsItem]  // good, bad, ugly — one each
}

interface NewsItem {
  type: 'good' | 'bad' | 'ugly'
  headline: string          // max 30 characters
  summaries: [string, string, string]
  editorNote: string        // 1–2 sentences
}
```

**Client-only state:**

| Key | Store | Rules |
|-----|--------|--------|
| Opened boxes `{ good, bad, ugly }` | `localStorage` key `gbu:opened:{edition.date}` | Load on boot if key matches **today’s Chicago date**. If edition date ≠ stored date, ignore and start empty. If storage is blocked, session-only (current in-memory behavior). |
| Mobile overlay (which story is full-screen) | React state only | Do not persist. |

**Do not store:** user identity, history of past editions, analytics events as product state.

**Clock:** `Intl` + `timeZone: 'America/Chicago'`. Cutover is Chicago midnight (start of that calendar date). A tab left open across midnight must treat the new date as a new edition on next focus/visibility.

---

## 6. Tech Stack & Tools

Keep the existing app. Do not migrate.

| Layer | Choice |
|--------|--------|
| UI | React 19 + Vite + TypeScript |
| Style | Tailwind CSS v4, black `#000` / white `#fff` only |
| Type | Instrument Serif (headlines/labels), Instrument Sans (body) |
| Data | Static JSON in the repo (or `/public`); no Supabase, no auth, no CMS |
| Hosting | Vercel static (Vite `build` output) |
| Time | `America/Chicago` via `Intl.DateTimeFormat` |

Do not add Next.js, a database, or UI component libraries. Lucide is unused; do not add icons to closed boxes.

---

## 7. Acceptance Criteria

The work is done only if all of the following pass.

**Surface (must not regress)**
- [ ] First paint: white viewport, three empty outlined boxes, no header/footer text visible, no vertical page scroll (`100dvh`, `overflow: hidden`).
- [ ] Closed boxes have no visible label; `aria-label` is `Open The Good` / `The Bad` / `The Ugly`.
- [ ] Desktop: click fills that box in place; other boxes stay empty until clicked.
- [ ] Mobile (&lt; 768px): click opens a full-screen story; tap the story closes it; opened boxes fill black and remain tappable to re-read.
- [ ] After all three opened: title “The Good, The Bad, and The Ugly”, Chicago date, footer exactly: `You're all caught up for today. You can close this tab now.`
- [ ] No color besides black and white. No extra controls.

**Edition & clock**
- [ ] Header `datetime` and visible date equal the calendar date in `America/Chicago`, not UTC.
- [ ] At `2026-09-08T04:30:00Z` the edition date is `2026-09-07`; at `2026-09-08T05:30:00Z` it is `2026-09-08` (CDT, UTC−5).
- [ ] Payload with missing type, ≠3 items, or headline &gt; 30 chars is not shown as a 3-box edition.

**Persistence**
- [ ] Open Good only, reload: Good still open, Bad and Ugly closed, header/footer still hidden.
- [ ] Open all three, reload: still complete (desktop: stories visible; mobile: three black boxes + chrome).
- [ ] After Chicago date change (or simulated next `edition.date`): three empty boxes, previous localStorage key ignored.
- [ ] Two tabs: last write wins; no sync backend.

**Deploy**
- [ ] `npm run build` succeeds.
- [ ] Production URL loads the ritual with no login.

**Explicit non-goals (fail the PR if added)**
- [ ] No routes other than `/`.
- [ ] No archive, feed, share, or settings UI.
- [ ] Footer is the last visible line; nothing below it.
