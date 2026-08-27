---
name: ChronoStep
description: An operational diary that opens every screen with a verdict and backs it with prose carrying the figures inside the sentence.
colors:
  ground: "oklch(0.976 0.004 255)"
  panel: "oklch(1 0 0)"
  sunken: "oklch(0.952 0.005 255)"
  line: "oklch(0.893 0.006 255)"
  line-strong: "oklch(0.795 0.008 255)"
  ink: "oklch(0.22 0.014 260)"
  ink-muted: "oklch(0.442 0.012 260)"
  good: "oklch(0.505 0.128 155)"
  good-field: "oklch(0.945 0.036 155)"
  warn: "oklch(0.508 0.115 68)"
  warn-field: "oklch(0.951 0.042 78)"
  bad: "oklch(0.515 0.178 26)"
  bad-field: "oklch(0.949 0.032 26)"
  inverse-ground: "oklch(0.22 0.014 260)"
  inverse-ink: "oklch(0.975 0.003 260)"
  focus: "oklch(0.55 0.17 258)"
typography:
  display:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: "3.1rem"
    letterSpacing: "-0.024em"
  headline:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: "2.5rem"
    letterSpacing: "-0.021em"
  title:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: "1.9rem"
    letterSpacing: "-0.011em"
  lead:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: "1.75rem"
  body:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.7rem"
  body-small:
    fontFamily: "Literata, Georgia, 'Times New Roman', serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.55rem"
  figure:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1.1rem"
    fontFeature: "tnum 1"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1rem"
    letterSpacing: "0.08em"
rounded:
  none: "0px"
  focus: "2px"
  pill: "999px"
spacing:
  hairline: "4px"
  tight: "8px"
  snug: "12px"
  base: "16px"
  section: "24px"
  block: "40px"
  chapter: "48px"
components:
  button-primary:
    backgroundColor: "{colors.inverse-ground}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "2.5rem"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "2.5rem"
  button-quiet:
    textColor: "{colors.ink-muted}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "2.5rem"
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bad}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "2.5rem"
  input-text:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  field-label:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
  status-chip-done:
    textColor: "{colors.good}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  status-chip-in-progress:
    textColor: "{colors.warn}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  status-chip-blocked:
    textColor: "{colors.bad}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  status-chip-todo:
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  error-note:
    backgroundColor: "{colors.bad-field}"
    textColor: "{colors.ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  running-session-bar:
    backgroundColor: "{colors.inverse-ground}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  dialog-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "20px 24px"
    width: "42rem"
---

# Design System: ChronoStep

## Overview

**Creative North Star: "The Verdict"**

ChronoStep reads like a page from a well-set report rather than a dashboard. Every screen opens with
a dateline, then one sentence that says how things actually stand, then a single paragraph at
reading measure that backs that sentence with figures set inline. The figures are never repeated as
tiles: the paragraph *is* the readout. That refusal is the identity, and it is why the interface has
no KPI row, no card grid, and no chart competing with the sentence above it.

The world is a cool near-neutral ground with no cards. Regions are divided by 1px rules and by
whitespace, not by floating panels; the only elevated surface in the whole build is the modal
dialog. Two typefaces carry the whole hierarchy: Literata is the human voice (verdicts, prose,
descriptions, notes) and JetBrains Mono is the instrument (every duration, count, date, time, status
code and control label). Strip out all the content and the alternation of those two faces still
reads as this product.

Colour is spent on one job only: judgement. Green means on track, amber means it wants attention,
red means behind. Nothing is tinted for decoration and nothing is tinted for identity, which is why
the primary action is ink rather than a brand hue — a coloured button would spend the single signal
the interface has. Both themes are first-class: light and dark are complete token sets, and the
un-toggled state follows the operating system.

**Key Characteristics:**
- Conclusion first: dateline, verdict sentence, one 68ch paragraph, then the work.
- No cards, no nested containers; 1px rules and whitespace divide everything.
- Serif for voice, mono for every figure and control label — the split is the identity.
- Colour means judgement only; the primary action is ink.
- Square corners everywhere except the focus ring (2px) and two circular dots.
- No text colour lighter than `ink-muted`; anything lighter may only draw a rule.

## Colors

A cool near-neutral ground with three judgement hues held at text weight, plus a matched set of
faint fields for the rare moment a judgement needs a background.

### Primary
- **Ink** — the near-black cool navy that carries all primary text, the active nav underline, the
  filled bars in the load charts, and, inverted, every primary button and the running-session bar.
  It is the closest thing this system has to a brand colour, and it is deliberately not a hue.
- **Inverse Ground / Inverse Ink** — the same pair flipped. Used only by the primary button, the
  selected theme-toggle segment, and the running-session bar, so an inverted surface always means
  "this is the action" or "this is live right now".

### Secondary
- **On-Track Green** — the judgement colour for a healthy reading: the verdict's full stop, a
  `figure` run inside the paragraph, the "Fatto" status chip, the pulsing dot on a live session.
- **Wants-Attention Amber** — due today, in progress, the unsaved-changes confirmation band.
- **Behind Red** — overdue, blocked, destructive actions, required-field asterisks, error notes.

Each judgement hue has a **field** partner (`good-field`, `warn-field`, `bad-field`): a very faint
tint used only as a background behind text already set in `ink`, and as the text-selection colour.
Fields never appear on their own as decoration.

### Neutral
- **Ground** — the page. Faintly cool, so the judgement hues read as signal against it.
- **Panel** — pure white in light, one step above ground in dark. Carries the header, dialogs, and
  every input. Not a card: it is a surface, always edge-to-edge or rule-bounded.
- **Sunken** — the hover wash on list rows and secondary buttons, and the track behind a load bar.
- **Line / Line Strong** — the 1px dividers that do all the structural work, the input border, the
  scrollbar thumb, and the neutral column in the six-month chart. `line-strong` is also the hover
  border on an input.
- **Ink Muted** — supporting prose, labels, metadata, placeholders. It clears 4.5:1 on both `ground`
  and `panel` in both themes.
- **Focus** — a blue reserved exclusively for the focus ring, the caret, and the focused input
  border. It is not a judgement colour and never carries meaning.

### Named Rules

**The Judgement-Only Rule.** Colour in this interface means exactly one thing: how something stands.
Green on track, amber wants attention, red behind. If a colour is not answering that question, it is
`ink`, `ink-muted`, or a rule.

**The Muted Floor Rule.** `ink-muted` is the lightest colour any text may take. There is no
`text-faint` token and none may be added. Anything lighter (`line`, `line-strong`) may draw a rule
or a border and may never carry a word. A previous build shipped a 2.56:1 grey holding real
information; making that unrepresentable in the token set is the fix that survives future edits.

**The No-Ramp Rule.** Colour never encodes quantity. Magnitude is drawn — a filled `ink` bar against
a `sunken` track, a taller column — never a green that gets greener. A heat ramp once made every
other green on the screen ambiguous.

**The Opaque Token Rule.** The tokens hold complete `oklch()` colours, so slash-opacity utilities
(`bg-panel/50`) do not work on them and must not be reintroduced. Reach for a dedicated token
instead of fading one; a faded ink is how unreadable text gets shipped.

## Typography

**Display / Body Font:** Literata (with Georgia, Times New Roman, serif)
**Label / Figure Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo, monospace)

**Character:** Literata is drawn for extended screen reading, which is exactly what a verdict
paragraph is, and it holds its colour at 44px without turning into a magazine masthead. JetBrains
Mono, with tabular figures forced on, keeps columns of durations comparable down the page. The two
faces do not split by size; they split by **register**.

### Hierarchy
- **Display** (600, 2.75rem / 3.1rem, -0.024em): the home verdict at `sm` and up. One per screen.
- **Headline** (600, 2.125rem / 2.5rem, -0.021em): the verdict on every other screen, the home
  verdict below `sm`, and the auth wall's greeting.
- **Title** (400, 1.5rem / 1.9rem, -0.011em): dialog titles and the task detail `<h1>`.
- **Lead** (400, 1.25rem / 1.75rem): a decision row's label; the running elapsed clock, in mono.
- **Body** (400, 1.0625rem / 1.7rem): the verdict paragraph, capped at 68ch. The only real body copy.
- **Body Small** (400, 0.9375rem / 1.55rem): input text, error notes, in-row prose.
- **Small** (0.8125rem / 1.25rem): mono selects, date inputs, tag readouts.
- **Figure** (mono, 500, 0.75rem / 1.1rem, tabular): every duration, count, date, button label, nav
  item, metadata line.
- **Label** (mono, 0.6875rem / 1rem, +0.08em, uppercase): section headings above a list, field
  labels, status chips. The wordmark uses the same size at +0.2em.

### Named Rules

**The Two Registers Rule.** Literata is the voice; JetBrains Mono is the instrument. A duration,
count, date, time, status code or control label is mono. A word is serif. Setting a word like "oggi"
in mono is monospace as costume.

**The Split Quantity Rule.** A counted quantity splits: the digit is mono, the noun is prose
("**3** cose scadute"). `countRuns()` in `src/lib/verdicts.ts` enforces this, and every counted
phrase goes through it.

**The Coloured Full Stop Rule.** The verdict sentence is set in `ink` and only its final period
takes the judgement colour. The page announces its own reading without a badge, a banner, or a
coloured heading. The stop is `aria-hidden` because it is a visual reading, not a word.

**The Tabular Rule.** Every figure in this interface is compared against another figure. `.tnum`,
`<time>` and `[data-numeric]` all force `tabular-nums` globally; a mono figure that is not marked
`data-numeric` is a bug.

## Layout

A single centred column, no grid framework. Three container widths are in use and each means
something: **6xl (72rem)** for screens whose content is lists that benefit from width (Oggi, Task,
task detail, and the app chrome); **4xl (56rem)** for the reading screens (Timeline, Report); **lg
(32rem)** for the auth wall. Gutters are `px-6` (24px) at every width, and page bodies open with
`py-10` (40px).

The vertical rhythm is coarse and consistent: 48px between chapters of a screen, 40px between the
verdict block and the first section, 16px between a heading and its list, 4–12px between a label and
the thing it labels. Inside a row, 12–16px; inside a control, 6–8px.

Lists are the primary structure: a top rule on the list and a bottom rule on each row, so rows read
as a ruled table without a table's chrome. Row hover is a `sunken` wash across the full row.

Responsive behaviour uses one breakpoint, 640px, and only for real reflows: the verdict steps from
2.125rem to 2.75rem on the home screen; a decision row's metadata drops beneath its title below the
breakpoint; the header nav takes a full row and scrolls horizontally rather than wrapping into a
column one line per link tall; the user's email is hidden. There is no mobile-only navigation
pattern and no hamburger — the same six links are always present.

The verdict paragraph is capped at 68ch, inside the 65–75ch reading band. Nothing else in the app is
measure-capped, because nothing else is prose at length.

### Named Rules

**The Chrome-Above Rule.** The running session lives in the application chrome, above the dateline,
never inside a page. A session outlives the page it was started from, and a Stop that existed only
on one task's screen stranded the timer when that task was deleted.

**The No-Tile Rule.** A figure stated in the verdict paragraph is never also drawn as a tile, a
counter, or a KPI card. If a number deserves a screen, it goes in the sentence.

## Elevation & Depth

This system is flat. Depth is carried by 1px rules, by a faint tonal step between `ground`, `panel`
and `sunken`, and by inversion — never by shadow. There is exactly one shadow token in the build and
it is spent on exactly one component.

### Shadow Vocabulary
- **Panel** (`box-shadow: 0 1px 2px oklch(0.22 0.014 260 / 0.06), 0 8px 24px oklch(0.22 0.014 260 / 0.05)`
  in light; `0 1px 2px oklch(0 0 0 / 0.4), 0 8px 24px oklch(0 0 0 / 0.28)` in dark): the modal dialog
  only. It is the one surface that genuinely floats above another.

### Named Rules

**The One Shadow Rule.** `shadow-panel` belongs to the dialog and nothing else. A shadow anywhere
else in this interface would be a card, and there are no cards.

**The Inversion Rule.** When something must dominate the screen it inverts (`inverse-ground` on
`inverse-ink`) rather than lifting. That is how the primary button, the live session bar, and the
selected theme segment all read as foreground without a single pixel of blur.

## Shapes

Square. Corner radius is `0` on every button, input, select, textarea, chip, dialog, error note and
status glyph. Three exceptions exist and each is functional rather than stylistic: the focus ring
takes a 2px radius so it does not read as a hard box on inline text; the live-session pulse dot and
the pending spinner are circles by nature; the scrollbar thumb is a pill so it does not collide
visually with the square UI it scrolls.

Borders are always 1px and always a neutral (`line` at rest, `line-strong` for emphasis or hover,
`focus` when focused, `bad` on a destructive or error surface). The active nav item is marked by a
2px bottom border in `ink` — the only 2px border in the system.

Iconography is drawn SVG on a 12px or 16px viewBox with `currentColor` strokes at 1.25–1.5px: the
four status glyphs (empty square, half-filled, solid, crossed), the three theme icons, and the
dialog close. Icons are geometric and stroke-based; nothing is filled for decoration, and no icon
font or glyph character stands in for one.

## Components

### Buttons
- **Shape:** square (0 radius), minimum height 2.5rem, `px-4 py-2`, mono label at 0.75rem/500.
- **Primary:** inverted — `inverse-ground` fill, `inverse-ink` label. Hover drops to 90% opacity.
  Never a hue.
- **Secondary (default):** transparent on `panel` with a 1px `line-strong` border and `ink` label;
  hover fills `sunken`.
- **Quiet:** `ink-muted` label, no border, no fill; hover raises to `ink`.
- **Danger:** 1px `bad` border and `bad` label; hover fills `bad-field`.
- **Pending:** every async button takes `pending`, which disables it, sets `aria-busy`, swaps in a
  spinning ring drawn from `currentColor`, and may swap the label ("Salvo…", "Un attimo…").
  Disabled is 50% opacity with `cursor-not-allowed`.

### Chips
- **Status chip:** a drawn glyph plus a mono uppercase label at 0.6875rem/+0.08em, tinted with the
  status colour. No background, no border, no pill. The glyph carries the status independently of
  colour, so it survives greyscale and colour blindness.
- **Tag:** `#tag` in mono at 0.75rem, `ink-muted`, no container. Tags are the user's own vocabulary
  and are never restyled by meaning. Overflow renders as `+N` in the same style.

### Cards / Containers
There are none. Regions are sections separated by a bottom rule in `line` and by vertical rhythm.
Lists are ruled top and per-row. The only bounded surfaces in the build are the header (`panel` with
a bottom rule), the dialog, and the error note.

### Inputs / Fields
- **Style:** full-width, `panel` fill, 1px `line` border, square, `px-3 py-2.5`, body-small serif.
  Selects and date inputs switch to mono at 0.8125rem, because their values are data.
- **Label:** always rendered by `Field`, which generates the id and wires `htmlFor`/`id` itself, so
  a control cannot ship with a label that is merely adjacent. Mono uppercase micro in `ink-muted`; a
  required field appends a `bad` asterisk. An optional hint sits below in serif tiny, wired through
  `aria-describedby`.
- **Hover / Focus:** border moves to `line-strong` on hover and `focus` on focus; the global
  `:focus-visible` ring is a 2px `focus` outline at 2px offset, and the caret is `focus`.
- **Placeholder:** `ink-muted` at full opacity.
- **Hidden label:** `Field` takes `labelHidden`, which moves the label to `sr-only` and lets the
  control sit directly in its parent's row or grid. For a ruled table of controls where a column
  heading already says what each one is; the label still exists, because the alternative — dropping
  it — is the failure `Field` was built to make impossible.
- **Checkbox:** the native control at 1rem square with `accent-ink`, and nothing else. It is already
  a square in this form language, its unchecked state already reads as "off", and its label is
  `sr-only` because the row beside it is the label. The only place it appears is the capture review,
  where every row can be dropped.

### Read-Only Band
A full-width band in the chrome, above the running-session bar: `warn-field` ground, `ink` text, a
bottom rule in `line`. It carries one sentence — this account may look and not change. `warn` rather
than `bad` because nothing is wrong; it is a condition to know about before trying something, not a
failure. It lives in the chrome for the same reason the session bar does: it is true of the whole
application, not of whichever screen is open. While it shows, the screens below it render no write
controls at all rather than disabled ones — except where disabling carries the meaning better, as a
step's status menu does, because its value is information worth reading.

### Review Row (Cattura)
A ruled row that is also a form: a checkbox, then the proposed value in an editable control rather
than as text. Nested rows carry the same `depth * 1.5rem` indent and the same mono numbering gutter
("1", "1.1") as the task screen, so a proposed outline and a real one read identically. A dropped
row stays in place at 50% opacity instead of disappearing — a list that reflows under the cursor
makes the next tick a guess. Dropping a row drops what is nested under it, and those rows dim and
lock with it: the screen asks `droppedSteps` the same question the writer does, so a row that is
still upright is a row that is still going to be written. A checkbox that disagrees with the verdict
above it is the one defect this component cannot survive.

### Navigation
Six permanent links in mono at 0.75rem inside a `panel` header with a bottom rule. The active item
carries `aria-current="page"`, a 2px `ink` bottom border and medium weight; inactive items are
`ink-muted` with a transparent border and raise to `ink` on hover. Below 640px the nav takes a full
row of its own and scrolls horizontally. The wordmark is mono micro uppercase at +0.2em.

### Dialog
`role="dialog"` with `aria-modal`, labelled by its title and described by its optional line. An ink
backdrop at 40%, a `panel` surface with a 1px `line` border and `shadow-panel`, capped at
`calc(100dvh - 3rem)` with an internally scrolling body so a long form stays reachable on a short
viewport. Focus is trapped on Tab, moved to the first focusable on open, and restored to the opener
on close; the page behind is scroll-locked. Header, body and footer are separated by 1px rules. When
the form holds unsaved edits, **every** dismissal — Escape, backdrop, close button — routes through
the same amber confirmation band, offering both answers explicitly ("Scarta le modifiche" /
"Continua a modificare").

### Verdict Block (signature)
The opening of every screen and the component the system is named for. A mono tiny dateline; then
the sentence at headline or display size in `ink`, capped at 68ch, with its final full stop alone
taking the judgement colour; then the supporting paragraph at 68ch in `ink-muted`, assembled from
typed runs. A run is `text` (serif prose), `figure` (a number, duration, percentage or tag in mono,
optionally judgement-coloured) or `emphasis` (a judged *word*, serif, judgement-coloured). The block
closes with a bottom rule in `line` and may carry one primary action beneath it. It is the page's
`<h1>` unless something else already names the page.

### Running Session Bar (signature)
A full-bleed inverted bar in the app chrome, above every page's dateline. A pulsing `good` dot, the
elapsed clock in mono lead with tabular figures, the task title as a linked sentence in serif, and
the Stop action pinned right as an `inverse-ink` button. When the session's task no longer exists,
the bar says so in prose and offers "Scarta sessione" instead.

## Do's and Don'ts

### Do:
- **Do** open every screen with the verdict block: dateline, one sentence, one 68ch paragraph.
- **Do** set every duration, count, date, time, status code and control label in JetBrains Mono, and
  mark it `data-numeric` so tabular figures apply.
- **Do** split a counted quantity through `countRuns()` — mono digit, serif noun.
- **Do** keep all text at `ink` or `ink-muted`; use `line` / `line-strong` for rules only.
- **Do** draw magnitude as a filled `ink` bar on a `sunken` track, or as column height.
- **Do** draw zero rather than leaving a slot blank: an em dash (—) with an `sr-only` explanation is
  this system's mark for "nothing here".
- **Do** pass `pending` to every button that fires an async write; it disables, announces
  `aria-busy`, and shows a spinner.
- **Do** pair every status colour with its drawn glyph, so status survives greyscale.
- **Do** ship both themes: any new token needs a value in `:root`, in `:root[data-theme="dark"]`,
  and in the `prefers-color-scheme` block.
- **Do** divide regions with 1px `line` rules and vertical rhythm.
- **Do** draw every icon as inline SVG on `currentColor`.

### Don't:
- **Don't** add a text colour lighter than `ink-muted`, and don't add a `text-faint` token.
- **Don't** use colour to encode quantity; no heat ramps, no graduated greens.
- **Don't** set prose words in the mono face — `figure` is a number, never a word.
- **Don't** introduce cards or nested containers; nothing gets a border *and* a fill *and* a shadow.
- **Don't** colour the primary action. It is ink, inverted; a hue there spends the judgement signal.
- **Don't** apply `shadow-panel` to anything but the dialog.
- **Don't** repeat a figure from the verdict paragraph as a tile, counter or KPI card.
- **Don't** use slash-opacity on a colour token (`bg-panel/50`); the tokens are complete `oklch()`
  values and it silently fails.
- **Don't** round a corner. Square is the form language; the focus ring, the two dots and the
  scrollbar thumb are the only exceptions.
- **Don't** leave a focusable element without a visible focus ring.
- **Don't** add a kicker or eyebrow above a heading; the dateline is content, not a label.
