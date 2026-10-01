---
title: Documentation style
description: Style rules for agentlet-core and agentlet-site documentation.
---

This page combines agentlet-core's documentation style guide with the additional rules this site (agentlet-site) enforces on top of it.

## Text and UI guidelines (agentlet-core)

1. **Remove excessive emojis.** Do not use emojis in headings, section titles, or button text.
   - Not: `<h1>Hello World - Agentlet Core</h1>`
   - Instead: `<h1>Hello world</h1>`

2. **Fix capitalization.** Use sentence case, only the first word capitalized, not Title Case.
   - Not: `<button>Initialize Agentlet Core</button>`
   - Instead: `<button>Initialize agentlet core</button>`

3. **Simplify text.** Remove marketing fluff and overly complex descriptions.
   - Not: "This example demonstrates the powerful AI integration capabilities..."
   - Instead: "This example demonstrates AI integration capabilities..."

4. **Avoid em dashes.** Use simple punctuation instead of em dashes in sentences.

Goals: a professional, business-ready appearance; consistent formatting across examples; functionality speaking for itself instead of marketing language; and text simple enough to stay easy to maintain and translate.

## Additional rules for this site (agentlet-site)

- English only.
- Sentence case in all titles, buttons, and navigation labels, for example "Get started", not "Get Started".
- No emojis in titles.
- No em dashes, no en dashes, and no middle dots anywhere. They read as machine-written. Use a comma, a period, or "and" instead. Numeric ranges are written as "2014 to 2018", not "2014-2018". Enforced by `scripts/check-typography.mjs`, run in `npm run lint` and again in CI against the built `dist/` output.
- No marketing puffery: avoid words like "revolutionary", "seamless", "supercharge", "unleash".
- Short sentences.
- Keep claims factual and traceable to their source. Every migrated documentation page ends with a plain-text source line naming the agentlet-core file and commit, or README/CLAUDE.md section, it was built from.
- Links between documentation pages use absolute paths under `/docs/...`, with anchors that exist. Links to files in agentlet-core outside its `docs/` folder use full GitHub URLs; no link points at a local file path.

## Design spirit

Simple, open source, honest. Plain typography, generous whitespace, content first, code blocks, one accent color. No gradients, no stock illustrations, no testimonials, no pricing, no hype.
