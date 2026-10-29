<!-- sync-kit prompt: add-side v1 -->
# Extra — Add a side

You are changing an installed sync-kit setup. A new side (a team or app, e.g. `mobile`) joins the project. This prompt
adds it to `sync/sync.config.json`, regenerates everything that lists the sides, and updates the project rules.
Existing notes are not changed.

## Goal

The new side is in `sides` (with its contract globs and, for Telegram, its managers), `sync/README.md`, the INBOX files
and the agent rule blocks list it, and `doctor` passes.

## Preconditions

- You are at the repository root, and sync-kit is installed: `node sync/scripts/sync.mjs state show` lists `"01"`
  under `phases`. If not, use `.sync-kit/prompts/01-install.md` instead.

## Inputs

- `sync/sync.config.json` — `sides`, `paused`, `contract.globs`, `notify.channel`, `notify.managers`, `lang`.
- `node sync/scripts/sync.mjs state show` — `decisions.agentFiles`.
- `.sync-kit/docs/config.md` — field validation and contract glob syntax (if `.sync-kit/` is missing, rely on the
  rules repeated below).
- The repository contents (read-only) and the user's answers.

## Steps

1. **Ask the user**, in one message:
   - the side id — short, lowercase, matching `^[a-z][a-z0-9-]*$`, not already in `sides` (e.g. `mobile`) — and its
     label (e.g. `Mobile`);
   - whether the side starts as paused (not worked on yet);
   - the side's contract files, if any: propose repo-relative globs from evidence in the repository (e.g. the new
     app's API client, schema or SDK folder) and list the files each glob matches today. Glob syntax: `*`, `?`, `**/`,
     `**`; no `{a,b}` braces — one glob per alternative;
   - only when `notify.channel` is `telegram`: the Telegram `@username`s to mention for this side (required unless the
     side is paused).

2. **Edit `sync/sync.config.json`** (keep 2-space JSON, change nothing else):
   - add `"<id>": "<label>"` to `sides`;
   - if paused, add `"<id>"` to `paused`;
   - if it has contract globs, add `"<id>": ["<glob>", …]` to `contract.globs`;
   - for `telegram`, add `"<id>": ["@username", …]` to `notify.managers`. For `gchat` and `none`, do not touch
     `managers`.

3. **Regenerate:**
   ```
   node sync/scripts/sync.mjs init
   ```
   It refreshes the sides table in `sync/README.md` and the INBOX files (and `sync/INBOX-<SIDE>.md` for a paused
   side). If it prints `error:` lines, fix the config and rerun.

4. **Agent rules.** The block lists the sides and contract globs. If `decisions.agentFiles` is not empty, regenerate
   it in every listed file (one `--file` per path):
   ```
   node sync/scripts/sync.mjs agent-rules --file AGENTS.md --file CLAUDE.md
   ```

5. **Project rules.** Update the project-rules block of `sync/README.md` (between
   `<!-- sync-kit:project-rules:start -->` and `<!-- sync-kit:project-rules:end -->`), in the config language: add the
   new side's contract files to "when a note is required", and update the example command or the QA section if they
   should mention the new side. If `sync/ONBOARDING.md` exists, update its sides list the same way. Change nothing
   outside the markers in `sync/README.md`.

6. **Existing notes** keep their `targets`; the new side is not added to them. If an open note concerns the new side,
   tell the user: the raising side can add `<id>: pending` to that note's `targets` in its own pull/merge request.

7. **Check:**
   ```
   node sync/scripts/sync.mjs check
   ```
   It must exit `0`.

## Hard rules

- Change `sync/sync.config.json` only as listed in step 2. Never put secrets in it.
- Never edit notes; never edit the generated block of `sync/README.md`, the agent-rules block or `INBOX*.md` by hand —
  the engine regenerates them.
- In `sync/README.md`, edit only between the project-rules markers.
- Never write `sync/.kit/state.json` by hand; this prompt does not change state.
- Do not run `git commit`; only suggest it.

## Outputs

- `sync/sync.config.json` with the new side.
- Regenerated `sync/README.md` generated block, `sync/INBOX*.md`, agent rule blocks; updated project rules (and
  `sync/ONBOARDING.md` if present).

## Verify

```
node sync/scripts/sync.mjs doctor
```

The exit code must be `0` and no line may start with `✗`. On `✗ every active side has managers in notify.managers`,
add the managers of step 1 for the side it names.

## Handoff

Tell the user to review and commit the changes, e.g. `chore(sync): add side <id>`. The CI jobs need no change.
