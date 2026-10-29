# Sync — cross-side change channel

This is where the sides of this project tell each other about every change or problem that **affects another
side**, and track it until each side has dealt with it. Each change or problem is one **sync note** (one markdown
file). Every receiving side has its own status inside that note.

- Sync notes are only the **communication layer between sides**: they point to tasks/PRs through `refs` and do not
  replace each side's own backlog.
- What is waiting on which side: see [INBOX.md](INBOX.md) (auto-generated).

## Project setup

<!-- sync-kit:generated:start -->
<!-- sync-kit:generated:end -->

## Layout

```
sync/
  README.md          # this file — the protocol
  INBOX.md           # generated: work waiting on each side — DO NOT edit by hand
  INBOX-<SIDE>.md    # generated: work waiting on a paused side (see "Paused sides")
  _TEMPLATE.md       # template of one sync note
  sync.config.json   # sides, modules, strictness, notification settings
  scripts/sync.mjs   # init | new | inbox | check | ...
  <module dirs>/     # notes, one directory per module (or notes/ for a flat layout)
    2026-09-24-be-task-patch-delete.md
```

File name = `id` = `<YYYY-MM-DD>-<raising side>-<slug>`. Date-based ids mean people creating notes in parallel on
different branches never collide on a sequence number.

## When a sync note is required

**Required** whenever your change makes another side do something or know something:

- changing an interface another side consumes (endpoints, payloads, error codes, enums, permissions, visible
  behaviour), fixing a bug that changes a response, deprecating something;
- finding a bug or odd behaviour in another side's work (`bug-report`), needing something new from another side
  (`feature`), or needing to ask a question (`question`).

**Not needed** for internal refactors, tests or docs that do not change a contract.

## Frontmatter

| Field | Value |
| --- | --- |
| `id` | same as the file name (without `.md`); never changes after creation |
| `title` | short title |
| `module` | one of the modules above (`general` when the layout is flat) |
| `from` | the raising side id |
| `author` | who raised it |
| `type` | `feature` \| `breaking` \| `bugfix` \| `deprecation` \| `bug-report` \| `question` |
| `priority` | `blocker` \| `high` \| `normal` \| `low` |
| `created` | `YYYY-MM-DD` |
| `refs` | related tasks/PRs, e.g. `[XYZ-FE-003, PR-47]` |
| `targets` | map `side: status` for **every receiving side** (not the raising side) |

### Status of each receiving side

```
pending ──► acked ──► applied
   │          │
   └──► disputed ◄──┘      (pushback → raising side replies → receiver moves back to acked/applied/n/a)
   └──► n/a                (does not affect this side — give the reason)
```

| Status | Meaning | Set by |
| --- | --- | --- |
| `pending` | nobody on the receiving side has read it | raising side, at creation |
| `acked` | read, agreed, will do it (say which task) | receiving side |
| `applied` | done on this side (give PR/commit) | receiving side |
| `disputed` | disagree / needs clarification / found a problem with this change | receiving side |
| `n/a` | not relevant to this side (give the reason) | receiving side |

A note is **closed** when every receiving side is `applied` or `n/a`. Closed notes stay in place as history. Never
delete a note.

### Paused sides

A side listed in `paused` in `sync.config.json` is temporarily not being worked on. Notes still carry its
`targets` entry so nothing is lost when it resumes. While paused:

- `INBOX.md` does not list that side's work, only the count and a pointer to `INBOX-<SIDE>.md` (the full list);
- "Open" in `INBOX.md` does not count notes that are only waiting on paused sides;
- reminders skip that side. Remove it from `paused` and run `sync.mjs inbox` to resume.

## Workflow

1. **Raise.** The side with the change runs:
   ```
   node sync/scripts/sync.mjs new --module <module> --from <side> --to <side[,side]> --type feature --slug task-patch-delete --title "Add PATCH/DELETE /tasks/:id" --refs "XYZ-FE-003"
   ```
   (omit `--module` when the layout is flat). Fill in the sections, then run `node sync/scripts/sync.mjs inbox`.
   Commit the note together with the PR of the change. A `bug-report` not tied to a code PR gets its own small PR
   containing only the note, merged early.
2. **Receive.** Before starting a task, each side reads its section of `INBOX.md`. For every relevant note, change
   `targets.<your side>` and **append one entry at the end of the "Discussion" section**:
   `### [FE] 2026-09-25 @handle — acked` plus 1–3 lines of text.
3. **Dispute.** Set `disputed` with a concrete reason in "Discussion". The raising side replies with a new entry
   and, if needed, edits the note's content/contract. Never edit someone else's entry.
4. **Apply.** When done, set `applied` and give the PR/commit in the entry.
5. After any change under `sync/`, run `node sync/scripts/sync.mjs inbox` and commit the INBOX files too.

## Automation

- **CI check** (runs on pull requests): `sync.mjs check` validates frontmatter, discussion entries and that the INBOX
  files are up to date. A PR that touches contract files without a sync note only produces a warning.
- **Notifications** (on push to the main branch): new notes, disputes and closed notes are announced to the channel
  configured in `sync.config.json` (`notify`).
- **Reminders** (scheduled): sides with open notes get a digest of the most urgent ones.
- Try locally without sending anything: `node sync/scripts/sync.mjs notify --before HEAD~1 --after HEAD --dry-run`.

## Project rules

<!-- sync-kit:project-rules:start -->
TODO: replace this line with this project's own sync rules (what counts as a contract, who reviews, naming conventions). Delete this line when done.
<!-- sync-kit:project-rules:end -->
