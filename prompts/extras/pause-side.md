<!-- sync-kit prompt: pause-side v1 -->
# Extra — Pause or resume a side

You are changing an installed sync-kit setup. A side is temporarily not being worked on (paused), or work on it starts
again (resumed). While a side is paused, its notes keep their `targets` entry, `sync/INBOX.md` shows only a count and
a pointer to `sync/INBOX-<SIDE>.md`, and reminders skip it.

## Goal

`paused` in `sync/sync.config.json` lists exactly the paused sides, the INBOX files and the sides table of
`sync/README.md` reflect it, and `doctor` passes.

## Preconditions

- You are at the repository root, and sync-kit is installed: `node sync/scripts/sync.mjs state show` lists `"01"`
  under `phases`. If not, use `.sync-kit/prompts/01-install.md` instead.

## Inputs

- `sync/sync.config.json` — `sides`, `paused`, `notify.channel`, `notify.managers`, `inbox.commit`.
- The user's answers.

## Steps

1. **Ask the user** which side to pause or resume. Show the sides from `sides` and the current `paused` list. The side
   must be a key of `sides`. At least one side should stay active; if the user pauses every side, point out that no
   reminder will be sent and ask them to confirm.

2. **Edit `paused`** in `sync/sync.config.json` (keep 2-space JSON, change nothing else):
   - pause: add the side id to `paused`;
   - resume: remove the side id from `paused`. If `notify.channel` is `telegram` and `notify.managers` has no handle
     for that side, ask the user for its Telegram `@username`s and add `"<id>": ["@username", …]` to
     `notify.managers` (doctor requires managers for every active side).

3. **Regenerate:**
   ```
   node sync/scripts/sync.mjs init
   ```
   It refreshes the "Paused" column in `sync/README.md`, `sync/INBOX.md` and, for each paused side,
   `sync/INBOX-<SIDE>.md` (side id in upper case, e.g. `sync/INBOX-MOBILE.md`).

4. **Resume only — remove the stale file.** The engine no longer writes `sync/INBOX-<SIDE>.md` for a resumed side, so
   the old file would go stale. Delete it (replace the name):
   ```
   node -e "require('fs').rmSync('sync/INBOX-MOBILE.md',{force:true})"
   ```

5. **Check:**
   ```
   node sync/scripts/sync.mjs check
   ```
   It must exit `0`.

6. Tell the user what changes for that side: paused — its open notes are only listed in `sync/INBOX-<SIDE>.md` and it
   gets no reminders; resumed — its notes appear again in `sync/INBOX.md` and reminders include it from the next
   scheduled run.

## Hard rules

- Change only `paused` (and, when resuming with Telegram, that side's `notify.managers` entry) in
  `sync/sync.config.json`.
- Never edit notes: a paused side keeps its `targets` entries.
- Never edit `INBOX*.md` or the generated block of `sync/README.md` by hand; delete only the stale
  `sync/INBOX-<SIDE>.md` of a resumed side.
- Never write `sync/.kit/state.json` by hand; this prompt does not change state.
- Do not run `git commit`; only suggest it.

## Outputs

- `sync/sync.config.json` with the updated `paused` list.
- Regenerated `sync/README.md` generated block and `sync/INBOX*.md`; the stale `sync/INBOX-<SIDE>.md` removed after a
  resume.

## Verify

```
node sync/scripts/sync.mjs doctor
```

The exit code must be `0` and no line may start with `✗`. On `✗ every active side has managers in notify.managers`,
add the managers for the resumed side (step 2).

## Handoff

Tell the user to review and commit `sync/sync.config.json` and the INBOX files (when `inbox.commit` is `true`) and
`sync/README.md`, e.g. `chore(sync): pause <side>` or `chore(sync): resume <side>`.
