---
name: The Good, The Bad, and The Ugly
description: A finite daily reading ritual in monochrome.
colors:
  black: "#000000"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Archivo Narrow, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "clamp(1.1rem, 2.5vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "Archivo Narrow, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "clamp(1.35rem, 3.2vh, 1.85rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  editor-heading:
    fontFamily: "Archivo Narrow, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: "Archivo Narrow, Arial Narrow, ui-sans-serif, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1rem, 1.7vh, 1.05rem)"
    fontWeight: 400
    lineHeight: 1.5
  editor-body:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  metadata:
    fontFamily: "Instrument Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  square: "0"
spacing:
  compact: "0.5rem"
  control-gap: "0.75rem"
  base: "1rem"
  section: "1.5rem"
  major: "2rem"
  workspace: "3rem"
components:
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.black}"
    rounded: "{rounded.square}"
    padding: "0.65rem 1rem"
  button-primary:
    backgroundColor: "{colors.black}"
    textColor: "{colors.white}"
    rounded: "{rounded.square}"
    padding: "0.65rem 1rem"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.black}"
    rounded: "{rounded.square}"
    padding: "0.75rem"
  story-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.black}"
    rounded: "{rounded.square}"
    padding: "1rem 0.5rem"
  story-card-opened:
    backgroundColor: "{colors.black}"
    textColor: "{colors.white}"
    rounded: "{rounded.square}"
---

# Design System: The Good, The Bad, and The Ugly

## Overview

**Creative North Star: "A finite daily reading ritual"**

A finite daily reading ritual. White surfaces, black type, and thin outlines keep the three stories distinct without adding decorative chrome. Condensed headings establish hierarchy while the body face carries summaries, sources, notes, and controls.

The owner editor inherits this same plain visual language: outlined fields, explicit labels, and a reader preview. Its denser working layout changes with available width while preserving the reader’s typography and monochrome materials.

**Key Characteristics:**
- Monochrome surfaces and thin outlines.
- Archivo Narrow headings with Instrument Sans reading and control text.
- Square corners and flat surfaces.
- State conveyed through inversion, borders, and plain text.

## Colors

A high-contrast neutral palette uses inversion rather than a separate accent hue.

### Neutral
- **Black:** Reading text, thin outlines, selected controls, opened mobile cards, and hover fills.
- **White:** Page and article surfaces, dialog backdrop, field interiors, and text on black states.

**The Monochrome Rule.** Use black and white for surfaces, text, borders, and interaction states.

## Typography

**Display Font:** Archivo Narrow with Arial Narrow and sans-serif fallbacks. The shipped Latin font is self-hosted with weights 600–700.

**Body Font:** Instrument Sans with UI/system sans-serif fallbacks. The page requests regular, medium, and regular italic through Google Fonts.

**Character:** Condensed headings make categories and story titles distinct; the wider body face keeps prose and operating controls legible.

### Hierarchy
- **Display:** The closed-card category uses the display token. Reader masthead uses a smaller fluid range (`clamp(1.05rem, 2.2vw, 1.55rem)`).
- **Headline:** The headline token governs reader story titles. Shared preview content uses an editor override (`1.85rem`, weight 700, line-height 1.2).
- **Editor heading:** The editor-heading token is the page title, reduced to (`2rem`) on small screens.
- **Title:** The title token governs editor section headings.
- **Body:** Reader summaries use the body token. Editor prose and fields use editor-body. Supporting editor paragraphs generally stop at (`65ch`); hints and publishing guidance use up to (`75ch`).
- **Label / metadata:** Labels use the label token; source attribution, publication dates, reader instructions, and the closing line use metadata. Editor hints use (`0.8125rem`, line-height 1.5).
- **Utility data:** Only the prepared correction fallback uses `ui-monospace, monospace` at (`0.875rem`).

**The Heading Pair Rule.** Use Archivo Narrow for reader and editor headings; use Instrument Sans for body text and controls.

## Layout

The reader fills the dynamic viewport. Its header and three-column card grid share a centered maximum width (`72rem`) and fluid side padding (`clamp(1rem, 4vw, 2.5rem)`). The cards remain three columns on small screens; the gap grows from (`0.5rem`) to (`1.25rem`) at (`768px`). Reader cards expand into scrollable articles on desktop. At widths up to (`1023px`), opening a card presents a full-viewport white dialog with a centered reading column (`44rem` maximum).

Article padding is fluid: horizontal (`clamp(0.75rem, 2vw, 1.5rem)`) and vertical (`clamp(0.9rem, 2.2vh, 1.5rem)`). Summary rows have a small square bullet and fluid vertical gaps. Notes sit below a larger gap with an indented left rule.

The editor scrolls as a page. Its header and main area use a wider centered maximum (`84rem`) and desktop side padding (`2.5rem`). The workspace has equal form and preview columns with a (`3rem`) gap; the preview sticks (`1.5rem`) from the top. At widths up to (`767px`), side padding becomes (`1rem`), header and edition details stack, Edit story / Preview story controls choose one workspace view, the preview becomes static, and publishing actions occupy full-width rows.

## Elevation & Depth

Surfaces are flat with no decorative shadows. Thin black borders, whitespace, and black/white state inversion supply separation. The reader card’s inset box-shadow is a keyboard focus treatment, not elevation. Dialogs keep an opaque white backdrop.

**The Flat Surface Rule.** Separate content with borders and space; reserve the existing inset ring for keyboard focus.

## Shapes

Cards, fields, buttons, notices, and previews use square corners and thin outlines (`1px`). Invalid fields strengthen the outline (`2px`); disabled editor controls use a dashed border and (`0.5`) opacity. Summary markers are solid squares (`0.25rem`), implemented as elements rather than glyph icons.

## Components

### Buttons
Plain outlined controls carry Instrument Sans. Editor controls use the button-outline and button-primary tokens, with a minimum height (`2.75rem`) and line-height (1.35). Pointer hover inverts the two colors; primary and selected controls invert back to white on hover. Reader utility buttons retain their compact padding (`0.5rem 1rem`) and minimum height (`2.75rem`).

### Cards / Containers
The signature reader card is a bordered rectangle with centered category text. Its closed state uses story-card; pointer hover and opened mobile state use story-card-opened. Desktop opened articles remain white and scroll internally. Story content has a category label, title, square-bulleted summaries, underlined source, date when supplied, and a left-bordered editor’s note. The editor preview reuses that content inside a bordered article.

### Inputs / Fields
Full-width, square, outlined controls inherit editor-body. Inputs have minimum height (`3rem`); textareas begin at (`7.5rem`) and resize vertically. Labels sit above fields with a (`0.5rem`) gap. Hints and errors use plain black text; invalid fields also thicken their border. Keyboard focus uses a black (`2px`) outline with (`4px`) offset.

### Navigation
The reader exposes Back to stories and Next controls within its small-screen reading dialog. The editor uses three equal-width outlined story selectors with black selected fills. Mobile view selectors share that treatment. Ordinary text links remain underlined with a (`4px`) underline offset.

### Focus and motion
Reader cards use a black (`2px`) outline at (`3px`) offset with an inset white/black ring. Other reading controls use visible black outlines. Reader story content fades in over (`280ms ease-out`), chrome over (`400ms ease-out`); reduced-motion preferences remove both animations and their transitions. Editor state changes are immediate.

## Do's and Don'ts

### Do:
- **Do** preserve black-and-white inversion for selected editor controls and opened mobile cards.
- **Do** retain readable source links, editor notes, and explicit form labels.
- **Do** preserve the independent reader and editor responsive thresholds.
- **Do** respect reduced-motion preferences for reader fades.

### Don't:
- **Don't** introduce accent colors into the monochrome identity.
- **Don't** replace the heading face with the superseded Instrument Serif.
- **Don't** add decorative shadows or rounded containers to these flat, square surfaces.
