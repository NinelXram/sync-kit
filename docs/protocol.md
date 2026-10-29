# The sync note protocol

This is the language-independent definition of a sync note. The engine (`sync/scripts/sync.mjs`) enforces it; the
`sync/README.md` generated in each project explains the same rules to the team in `en` or `vi`. Field names, enum
values and statuses are identical in both languages.

## Sides

A **side** is a team or role that sends and receives notes: `be`, `fe`, `mobile`, `qa`, `dev`, … Sides are declared in
`sync/sync.config.json` as `id → label` ([config.md](config.md#sides)). The id is used in note ids, in `from` and
`targets`, and in commands; the label is shown to humans.

## One note = one file

A note announces **one** change or problem that affects other sides. It lives in a module folder under `sync/` (or in
`sync/notes/` for a flat layout) and its file name is its id:

```
<YYYY-MM-DD>-<from>-<slug>.md          e.g.  sync/billing/2026-10-29-be-add-refunds.md
```

`slug` matches `^[a-z0-9]+(-[a-z0-9]+)*$`. Date-based ids mean people creating notes in parallel on different branches
never collide. Create notes with the engine, which fills the id, date and frontmatter:

```
node sync/scripts/sync.mjs new --module billing --from be --to fe,qa --type feature --slug add-refunds --title "Add refunds endpoint" --refs "ABC-123"
```

(`--module` is omitted for a flat layout; optional `--priority` and `--author`.) Notes are never deleted: closed notes
stay as history.

## Frontmatter

YAML-like frontmatter between `---` lines, one `key: value` per line, no inline comments.

| Field | Required | Value |
| --- | --- | --- |
| `id` | yes | same as the file name without `.md`; never changes |
| `title` | yes | one line (no line breaks) |
| `module` | yes | a module from the config, or `general` for a flat layout |
| `from` | yes | the raising side id |
| `author` | no | who raised it, e.g. `"@alice"` |
| `type` | yes | `feature` \| `breaking` \| `bugfix` \| `deprecation` \| `bug-report` \| `question` |
| `priority` | yes | `blocker` \| `high` \| `normal` \| `low` |
| `created` | yes | `YYYY-MM-DD`, the machine's local date when the note was created |
| `refs` | no | related tickets / PRs, e.g. `[XYZ-FE-003, PR-47]` |
| `targets` | yes | map `side: status` for every receiving side (never the raising side) |

Example:

```
---
id: 2026-10-29-be-add-refunds
title: "Add refunds endpoint"
module: billing
from: be
author: "@alice"
type: feature
priority: normal
created: 2026-10-29
refs: [ABC-123]
targets:
  fe: pending
  qa: pending
---
```

## Statuses

Each receiving side has its own status in `targets`:

```
pending ──► acked ──► applied
   │          │
   └──► disputed ◄──┘      (pushback → raising side replies → receiver moves to acked / applied / n/a)
   └──► n/a                (does not affect this side — give the reason)
```

| Status | Meaning | Set by |
| --- | --- | --- |
| `pending` | nobody on the receiving side has read it | raising side, at creation |
| `acked` | read, agreed, will do it | receiving side |
| `applied` | done on this side (give a PR / commit / ticket reference) | receiving side |
| `disputed` | disagree, needs clarification, or found a problem with the change | receiving side |
| `n/a` | does not affect this side (give the reason) | receiving side |

`pending`, `acked` and `disputed` are **open**; `applied` and `n/a` are **done**. A note is **closed** when every
receiving side is done. The set of statuses is fixed — it cannot be configured.

## Discussion entries

Every note has a Discussion section, headed `## Discussion` (or `## Thảo luận` — both are accepted in either
language). Each time a side changes its status in `targets`, it **appends** one entry at the end of that section:

```
### [<LABEL>] <YYYY-MM-DD> <@handle> — <status> [rest of line]
1–3 lines of text.
```

- `<LABEL>` matches a side by id **or** label, case-insensitively (`[QA]` belongs to side `qa`).
- The separator may be `—`, `–` or `-`.
- The entry's status is the **first word** after the separator, lowercased. The rest of the heading line (for example
  `(XYZ-FE-003)` in `— applied (XYZ-FE-003)`) counts as text.
- Never edit someone else's entry; reply with a new one.

Example:

```
## Discussion

### [FE] 2026-10-30 @bob — acked
Planned for XYZ-FE-004.
### [QA] 2026-10-31 @carol — raised
Refund of a partially paid order returns 500.
### [FE] 2026-11-02 @bob — applied (XYZ-FE-004)
Merged in PR-52.
```

### Entry vocabulary

Besides the five target statuses, these entry statuses are recognised: `raised`, `reopened`, `verified`, `confirmed`,
`withdrawn`, `reply`, `note`. They are used for conversation that does not change a target (a QA finding, a reply
from the raising side, a confirmation). Any other word only produces a **warning**, never an error.

## Strict checks

With `strict.enabled` (default `true`), `node sync/scripts/sync.mjs check` applies these rules to every note whose
`created` date is **on or after** `strict.since`:

1. Every target that is not `pending` needs a matching entry: the last entry of that side whose status is one of the
   five target statuses must have the same status as `targets.<side>`.
2. `applied` needs a reference in that entry (heading rest or text): a PR / MR number (`#12`, GitLab `!12`, `PR-47`), a commit hash,
   a URL or a ticket id (`XYZ-FE-003`).
3. `disputed` and `n/a` need a reason (any text in that entry).
4. Unknown entry statuses produce a warning.

**Scope.** Strictness is decided by the note's `created` date only. A note created before `strict.since` is **never**
strict-checked, even if it is edited after the kit was installed — this is deliberate, so notes that existed before
installation (often without a Discussion section) keep passing. To apply strict checks to older notes, move
`strict.since` earlier in `sync/sync.config.json` (and fix the notes that then fail). `strict.since` is a local date
(`node sync/scripts/sync.mjs state today`), never a UTC date, so a note created on the installation morning is not
mistaken for an older one.

Non-strict rules (frontmatter fields, enums, id = file name, `from` not in `targets`, INBOX up to date when
`inbox.commit` is `true`) apply to every note.

## Roles

**Raising side.** Creates the note with every affected side in `targets` as `pending`, commits it in the same pull
request as the change (a `bug-report` not tied to a code change gets its own small pull request), replies to
disputes with a new entry and, if needed, edits the note's content.

**Receiving side.** Reads its INBOX before starting work, moves its own target only, and appends an entry for every
change.

**QA.** QA is an ordinary side. It raises `bug-report` notes (`from: qa`) against the side whose work is broken, and
receives notes as a target when a change needs testing — `acked` when testing is planned, `applied` (with a reference
such as a test run or ticket) when verified, `disputed` when the change does not work. Conversation-only entries such
as `raised`, `verified` or `reopened` are allowed and do not change any target.

## Paused sides

A side listed in `paused` is temporarily not being worked on. Notes keep its `targets` entry so nothing is lost. While
paused, `INBOX.md` only shows a count and a pointer to `INBOX-<SIDE>.md`, notes waiting only on paused sides do not
count as open in `INBOX.md`, and reminders skip the side. Strict checks still apply to its entries. Remove it from
`paused` and run `node sync/scripts/sync.mjs inbox` to resume.

## INBOX

`node sync/scripts/sync.mjs inbox` regenerates `sync/INBOX.md` (open work per active side, most urgent first) and one
`INBOX-<SIDE>.md` per paused side. Never edit them by hand. With `inbox.commit: true` they are committed and `check`
fails when they are stale.

## Contracts

`contract.globs` lists, per side, the files other sides consume. In CI, on each pull request:

```
node sync/scripts/sync.mjs contract-check --base <ref> --head <ref>
```

It warns when the change touches such a file without adding or changing a note (an error with `--strict`).

## Notifications

On push to the default branch, `notify --before <sha> --after <sha>` announces three events: a **new** note with open
targets, a target newly **disputed**, and a note that became **closed**. A first push (or a new branch, where the
before-SHA is all zeros) compares with the previous commit. On Google Chat, every message about one note goes to the
same thread (thread key = note id). `remind` (scheduled) sends a new digest of open notes per active side, at most
`notify.remindMaxItems` per side.
