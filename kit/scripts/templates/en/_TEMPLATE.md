---
id: 2026-09-24-be-short-slug
title: "Short title of the change / problem"
module: general
from: be
author: "@handle"
type: feature
priority: normal
created: 2026-09-24
refs: [XYZ-FE-003, PR-47]
targets:
  fe: pending
---
<!--
Sync note template. Prefer creating notes with the command (it fills frontmatter, id and date):
  node sync/scripts/sync.mjs new --module <module> --from <side> --to <side[,side]> --type <type> --slug <kebab-case> --title "..."
Valid values for each field: see sync/README.md § Frontmatter. No inline comments inside the frontmatter.
Delete sections that do not apply, but always keep the "Discussion" section.
-->

## Summary

1–3 sentences: what changes / what the problem is, and why the receiving side should care.

## Details

- For `feature` / `breaking` / `bugfix` / `deprecation`: describe the new behaviour and context.
- For `bug-report`: steps to reproduce, expected vs actual, real request/response (hide tokens).
- For `question`: the concrete question and the options being weighed.

## Contract (before → after)

| | Before | After |
| --- | --- | --- |
| Interface | — | `PATCH /tasks/:id` |
| Input | — | `{ title?: string, ... }` |
| Output | — | `{ data: Task }` |
| Errors | — | `404 TASK_NOT_FOUND` |

## What the receiving side must do

- [ ] FE: ...

## How to verify

Command / screen / sample request the receiving side can use to confirm the change works.

## Discussion

<!-- Each time you change your status in `targets`, append one entry at the END of this section (never edit someone else's entry):
### [FE] 2026-09-25 @handle — acked
Read it, planned for XYZ-FE-004.
### [FE] 2026-09-27 @handle — applied
Applied in PR-52 (commit abc1234).
-->
