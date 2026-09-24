# Ticketyangu — Accessibility Audit

Honest split: what's below was verified by running real checks (contrast
math, code review of every component for labels/semantics/focus
handling), and what still needs a human with a browser, a keyboard, and a
screen reader — this environment has neither.

## Verified: color contrast (WCAG AA)

Computed actual relative-luminance contrast ratios (the real WCAG formula,
not eyeballed) for every text/background pair in the design system. Found
and fixed two real failures before they shipped:

| Pair | Before | After | Fix |
|---|---|---|---|
| `saffron-dark` text on `paper` | 3.06:1 (FAIL) | 4.96:1 (PASS) | Split into two tokens: `saffron-dark` (`#b87f1f`) stays for backgrounds/borders/focus rings, where it's also used and where darkening it further breaks button-hover text contrast (checked: drops to 2.48:1); new `saffron-text` (`#8c5f13`) is used everywhere the color sits as *text on paper* — links, active nav state, price/CTA text, card hover titles. |
| `ink-faint` text on `paper` | 3.62:1 (FAIL) | 5.43:1 (PASS) | Darkened the token directly (`#8a7c67` → `#6e6049`) — this one has no background use anywhere in the codebase, so no split was needed. |

Also caught and fixed a second-order issue: `Badge`'s tinted backgrounds
(`bg-saffron/15`, `bg-sage/15`, `bg-rust/15`) blend with `paper` to a
*lighter* effective background than pure paper, which pushed all three
badge text colors just under 4.5:1 (4.49 / 4.22 / 4.36) even after the
saffron fix above. Reduced the tint to `/10`, which clears 4.5:1 for all
three with margin (4.64 / 4.52 / 4.70).

Every other pair in the system — body text, secondary text, both button
variants (light and dark mode), both themes' link colors, active category
chips (solid background + contrasting text) — was checked and already
passed. The calculation script is a plain Python luminance/contrast
implementation; rerun it against `src/index.css` if you change any color
token, since a value that looks fine can silently fail the ratio.

## Verified: code-level review

Went through every component for:

- **Icon-only buttons have `aria-label`**: close button, theme toggle,
  mobile menu trigger, search shortcut, calendar prev/next, check-in
  quantity +/− buttons, social links in the footer, ticket check-in
  reversal — checked each one individually rather than assuming a
  pattern held everywhere.
- **Focus states**: a single global `:focus-visible` rule in `index.css`
  (not per-component), so nothing can accidentally ship without one.
- **Reduced motion**: `prefers-reduced-motion` is respected globally
  (animations drop to ~0 duration) and Radix's dialog animations inherit
  that automatically.
- **Skip link**: present in `Layout.tsx`, visually hidden until focused.
- **Heading order**: each page has exactly one `h1`, with `h2`/`h3` used
  in document order (checked page by page — `DiscoveryPage`,
  `EventDetailPage`, `CalendarPage`, `OrganiserDashboardPage`, etc.).
- **Form labels**: every input in `LoginPage`, `SignUpPage`,
  `OrganiserApplyPage`, and `OrganiserEventFormPage` has an associated
  `<label htmlFor>`, not just a placeholder.
- **Dialog focus trapping**: comes from Radix's `Dialog` primitive, which
  handles this correctly by default — not something we implemented
  ourselves, so it's as reliable as Radix's own test suite.
- **Status announcements**: `EmptyState` uses `role="status"`,
  `ErrorState` uses `role="alert"`, form errors use `role="alert"`.

## NOT verified — needs a human pass before launch

This environment has no browser, so none of the following were actually
tested, only reasoned about from the code:

- **Real screen reader testing** (VoiceOver, NVDA, TalkBack) — code review
  can catch a missing `aria-label`, but not how the whole flow *sounds*
  when read aloud, especially the checkout dialog's step transitions and
  the check-in page's live result feedback.
- **Real keyboard-only navigation** — tab order, whether focus is
  correctly moved when the checkout dialog transitions between steps,
  whether the mobile menu correctly returns focus to its trigger on close.
- **Zoom/reflow at 200%** — the responsive classes are there, but nobody
  has actually zoomed a real viewport to check for overlap or clipping.
- **Actual color perception** — the contrast math is correct, but nobody
  colorblind has looked at the saffron/rust/sage palette to confirm the
  category color-coding doesn't collapse into "everything looks the same"
  for a common form of color vision deficiency. Category names are always
  shown as text alongside the color, which mitigates this, but it's worth
  a real check.

Run these before launch, not just before a demo.
