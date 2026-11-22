---
name: design-principles
description: Universal UI/UX, copywriting, theming, and frontend architecture principles derived from human design review. Use when designing, redesigning or reviewing UI components, pages, navigation, styles, themes, and state boundaries.
---

# Universal Design & UX Principles

Apply these when building or reviewing user-facing web apps. They exist to prevent the typical failure of AI-made UI: every element rendered with the same weight (chips, borders and boxes everywhere), data dumped instead of selected, and copy that talks about the system instead of to the user. Project-specific values (colors, component names) belong in the project's `DESIGN.md`, not here.

## 0. Start From the User's Question
- **Name the question each screen answers before touching layout.** ("When do we play next?", "Which session was that?") Put the answer in the first viewport; push everything else down or to a detail page. Write this table into the project's `DESIGN.md`.
- **Surface what needs the user first.** Items awaiting the user's reply or decision (polls, invites, conflicts) come before passive history.
- **Redesign from the task, not from the current markup.** When asked to improve a screen, sketch what the user needs, then map existing data onto it. Polishing the existing structure is not a redesign.

## 1. Hierarchy: One Loud Thing Per Screen
- **One primary action per view.** A global action that already lives in the navigation (e.g. "記録") must not be repeated in each page header. Contextual variants ("record for this table") are fine.
- **Three button tiers only:** primary (filled brand color), secondary (1px outline on a surface fill), quiet (subtle neutral fill, no border) for close/cancel/inline helpers. Icon-only buttons need an `aria-label` and a 40–44px hit area. A text button with no fill and no border (pure ghost) has no affordance; do not use it.
- **Use emphasis sparingly.** Brand color = primary action, current location, or "this concerns you". Badges/pills = genuine exceptions of state (secret, critical, pending). Never pill-ify every piece of metadata, counts, owners or deltas.
- **Selection controls use a neutral track.** Segmented controls show the active option as a raised surface, not a brand-color fill; brand fill is reserved for the primary action.

## 2. Surfaces and Lists
- **Never nest boxes.** One surface level per region. Inside a surface, separate with dividers or whitespace, not another bordered box.
- **Lists are rows, not card grids.** Card grids are for visually distinct objects with an image (characters, covers). Chronological lists are grouped under date headings.
- **Rows show identifier, context, and one distinguishing cue.** Title first, a single muted meta line, then at most one supporting line (e.g. avatar stack + names). Secondary details go to the detail page.
- **Metadata lines are separated by spacing, not glyphs.** `·` or `/` separators end up at the start of wrapped lines on mobile; use column-gap.

## 3. Navigation and Responsive Layout
- **Keep top-level destinations to 5±2.** No counts in navigation (they are vanity metrics and change meaning per user). No duplicate shortcut lists that mirror another nav item.
- **Desktop: fixed full-height sidebar. Mobile: top app bar + bottom tab bar** with safe-area padding; avoid hamburger drawers for primary destinations.
- **Dialogs become bottom sheets on mobile;** long forms get a sticky action bar. Zero horizontal page overflow at 360–390px is a hard requirement (assert it in E2E).
- **Constrain reading width** (~65–80 characters for long text such as logs) even on wide screens.

## 4. Zero-Bootstrap & Minimal Manual Input
- **Never demand input for derivable fields.** Infer dates, durations, roles from files/timestamps; keep metadata optional.
- **No vanity counters or fake metrics.** Summary totals, progress bars and zeroed widgets look broken on empty or partial data.
- **Empty states give one direct action**, not an empty dashboard.

## 4b. Model First, Then UI
- **An awkward UI is usually an awkward data model.** Before patching a screen, check whether the type represents the real-world thing. Example: a multi-day session stored as `dates[] + one start/end time`, which forced a "write 25:30 when you cross midnight" hint; the natural model is a list of sittings, each with a start and end datetime. Fix the type and the hint disappears.
- **Required relations are required.** If every growth record happens after some session, `sessionId` is not optional and the UI offers no "not linked" choice.
- **One fact, one source.** When data is mirrored from an external source of truth (a character sheet, a calendar), the mirror is read-only in the UI; changes are derived (diff on sync), not typed in again. Show only values that actually persist; don't show per-session values as "current".
- **Derive, don't ask.** Before/after values, dates, durations, defaults from the previous step: compute them. Offer one action for the common bulk case ("everyone at the table played").
- **Accept only input you can read reliably.** Don't ship importers for free-form formats (chat transcripts, arbitrary CSV, plain text) whose parsing is a guess; a wrong import is worse than none.
- **Security decides discoverability.** Don't let users search other users by name; invite by link. Identifiers that others rely on (user IDs) are immutable.

## 4c. Choosing Controls by Option Count
- 2–5 options to compare side by side: segmented control. A small fixed list: select. Many options, or a list that can grow (game systems, skills, scenarios, people): searchable combobox. Several values: multi-select combobox with removable tokens (Notion-style). Never ask for comma-separated text.

## 4d. Words Follow Context
- When a screen is about one specific thing (a session of one game system, one character), use that domain's own vocabulary (e.g. "KP" in Call of Cthulhu). Cross-cutting screens (lists, filters, navigation) use the generic term ("GM").
- Keep one register for sentences (in Japanese: です・ます, including transient button text like 「コピーしました」). Labels may be nouns.

## 5. Theme Harmony (Light & Dark)
- **Navigation surfaces follow the theme** (light sidebar in light mode) unless the product explicitly wants otherwise.
- **No pure white text in dark mode;** use a muted off-white (~80–85% luminance) for long reading.
- **One hue family** for ground, surface, border and hover tints. Define colors as tokens; never hardcode per-component hexes.

## 6. Copy: Direct, Human, Quiet
- No poetic filler taglines, marketing fluff, spaced em-dashes (` — `), decorative sparkle/wand icons, or self-evident "〜できます。" sentences.
- Never expose parser/heuristic internals ("CC<= detected", "estimated from log") or fabricate auto-generated prose.
- No native `title=` tooltips (inaccessible on touch). Use visible labels, inline hints or `aria-label`.
- Put keyboard shortcuts on the control they trigger (`送信 [Ctrl+Enter]`).

- **Explanatory text is a symptom.** Every helper sentence is a sign the label, layout, default or state doesn't speak for itself; fix those first. If an explanation is truly needed, put it where the user who needs it can open it (a guide dialog, a disclosure), concise and in bullets. Budget: one short sentence per paragraph in app UI, and assert it on the rendered DOM.
- **Drop information nobody decides with:** labels that restate the obvious ("current value"), legends, "recorded since…", import internals, counts you can see.

## 6b. Identity Images
- People, groups and characters get images users can upload; the default is a deterministic generated image (identicon-like, seeded by an immutable ID) in the product's palette. Never use a single-letter avatar.

## 7. Inline Feedback & Optimistic UI
- No floating toasts. Errors and statuses appear next to the control that caused them (`role="alert"` / `role="status"`).
- Reflect optimistic state immediately; don't add "✓ Saved" banners when the UI already shows the new state.
- Transient feedback (copy to clipboard) changes the button itself, with a fixed width so nothing shifts.
- **Mark the moment of completion.** Restraint is not the absence of motion: finishing an important flow (recording a session, finishing onboarding) deserves a clear break (dialog or page change), a short satisfying animation (150–400ms, ease-out, honoring reduced motion) and a curated next step (one primary, the rest secondary). A results page that just lists fields and buttons feels like a dead end.
- **Controls sit next to what they act on; decisions sit at the end of the flow.** "Back"/"choose again" never occupies the position of the confirm button. Let users change a setting where they notice it instead of sending them to the settings page.
- **First-run setup is one skippable flow** (name, ID, avatar, first import), not a permanent banner.
- **Optical alignment:** neighbouring controls must look the same size and weight (icon stroke, button height, container max-width). A secondary button floating on the page ground without a surface looks broken.

## 8. Controls
- Replace native `<select>` and native file inputs with themed controls (`role="listbox"`, Escape/outside-click; `<label>` wrapping an `sr-only` file input).
- Menus never sprout horizontal scrollbars: `overflow-x-hidden min-w-full w-max max-w-*` with truncated full-width options.
- Hover never inverts foreground/background; transitions ~150ms; press feedback is a tiny scale, disabled under reduced motion.

## 9. Spoilers & Privacy
- State default visibility plainly in a dismissible onboarding notice with a one-click path to settings.
- Guard spoilers and secrets behind explicit, effortless toggles or scope controls; never silently filter content.

## 10. Architecture & Enforcement
- **Keep a feedback ledger** (e.g. `docs/design-feedback.md`): every critique the user ever gave, distilled into a rule and mapped to how it is enforced (lint / runtime audit / component type / visual review). Brief every redesign or delegated UI task against it; a "fresh redesign" that ignores past decisions will silently regress them (it happened: per-event calendar export and modal-everything came back after a from-scratch pass).
- **Make the bad version unwritable.** Prefer component APIs that cannot express the banned pattern (e.g. a notice component with no success tone, a system label that resolves its own name) over prose rules; then lint for duplicated primitives so screens cannot fork their own.
- **Audit the rendered DOM, not just the source:** horizontal overflow, nested surfaces, more than one primary action, text under 12px, banned copy (excluding user-written content), button contrast, dark-mode text glare.
- Keep formatting, date math and export builders in pure, framework-free modules with unit tests; one format per concept everywhere.
- **Generalize every critique into a principle** and keep a principle table with a "repeat count". A check written against the critique's literal wording (ban this exact sentence) stops that sentence, not the next instance of the same mistake. When a principle is violated a second time, its enforcement must move from visual review to lint / DOM audit / types.
- Turn every rule a reviewer had to repeat into a static lint check (regex/AST) or an E2E DOM assertion (overflow, contrast). A rule that only lives in prose will regress.
- **Verify visually, not by reading code:** after each UI change, screenshot desktop (1440), mobile (390) and dark mode, and check each screen against its question from §0.
