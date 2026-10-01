---
title: Commit rules
description: Conventional Commits format enforced on agentlet-core.
---

agentlet-core enforces the [Conventional Commits](https://www.conventionalcommits.org/) specification using commitlint and husky.

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Required types

| Type | Meaning |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes, formatting, missing semicolons |
| `refactor` | Code refactoring without changing functionality |
| `perf` | Performance improvements |
| `test` | Adding or updating tests |
| `build` | Build system changes, webpack, npm scripts |
| `ci` | CI/CD configuration changes, GitHub Actions |
| `chore` | Maintenance tasks, updating dependencies |
| `revert` | Reverting previous commits |
| `disable` | Disabling features or functionality |
| `simplify` | Simplifying code or architecture |

## Rules

- Use lowercase for the subject line.
- Do not end the subject with a period.
- Keep the header under 72 characters.
- Use present tense: "add", not "added".
- Use imperative mood: "move cursor to...", not "moves cursor to...".

## Examples

```text
feat: add table extraction API for agentlets
fix: resolve DOM manipulation issue in form filler
docs: update API documentation for table extractor
style: improve CSS formatting in panel component
refactor: use CLI parameters for plop instead of file modification
disable: turn off Playwright video recording
```

Commits are automatically validated via husky git hooks. Invalid commits are rejected.

## Other development rules

- Never commit or push if tests fail locally; always test first before any git-related action.
- Every new file under `src/` is written in TypeScript. Any existing `.js` file under `src/` that a change touches, and that is under 300 lines, is converted to `.ts` in the same change.
- No `any`. ESLint rejects explicit `any` in `.ts` files; use `unknown`, or a precise union, with a one-line comment for genuinely dynamic values.
- `npm run typecheck` must pass before any commit, alongside `npm test`, `npm run build`, and `npm run lint`.
