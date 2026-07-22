# Product

## Register

product

## Users

Developers evaluating or integrating `@liquidium/client`. They arrive to see real mainnet flows working end to end — quotes, deposit targets, repayment, portfolio health — and leave with patterns they can copy into their own app. They are technical, impatient with fluff, and read dense data comfortably. Context: desktop-first, often with the repo and docs open beside the demo.

## Product Purpose

A working reference implementation of the Liquidium SDK, not a marketing site. Three modes: Insights (live pool market data), Simple loan (accountless cross-chain borrow), Advanced (wallet-connected supply/borrow/portfolio). Success looks like: a developer trusts the SDK because the demo feels precise, live, and engineered.

## Brand Personality

Quiet instrument. Linear/Raycast-grade restraint: one sans (SF Pro), a four-step type scale, hierarchy carried by gray value rather than size or decoration. The dithered charts are the single moment of texture; everything else disappears into the task.

## Anti-references

No terminal cosplay (bracket kickers, mono everywhere, scanlines), no giant display type, no gradient chrome, no dark-mode-for-its-own-sake. Nothing that reads as decoration rather than instrument.

## Design Principles

- The tool disappears into the task: familiar affordances, one component vocabulary, no invented interactions.
- Hierarchy by value, not volume: #292929 / #5D5D5D / #9E9E9E separate primary, secondary, and meta — size stays in a 12/13/14/24 scale.
- Data is the hero: numbers get tabular figures and typographic priority; the dither charts carry all of the texture budget.
- Motion conveys state only: 150–250ms transitions for feedback and loading; no orchestrated page-load choreography.
- Density with air: compact controls (8px radius), generous card containers (16px radius), pill CTAs reserved for the one primary action per view.

## Accessibility & Inclusion

WCAG AA baseline: body text ≥4.5:1 (primary/secondary grays on white), visible focus rings, full keyboard operability, `prefers-reduced-motion` support, live regions for async state changes (quotes, loan status). Tertiary #9E9E9E is reserved for non-essential metadata per owner direction.

## Visual Spec (owner-directed)

- SF Pro (system stack), regular + medium only, -0.15px letter spacing
- Type sizes: 12, 13, 14, 24px only
- Hierarchy: #292929 primary, #5D5D5D secondary, #9E9E9E tertiary on white
- Icons: 14px navigation, 20px cards
- Radii: 8px navigation/controls, 16px cards, pill CTAs
- Theming: light is the default; dark mode inverts via `.dark` tokens (near-black surfaces, white pill CTAs, brighter chart palette). Toggle lives in the topbar, persists to `localStorage`, defaults to system preference.
