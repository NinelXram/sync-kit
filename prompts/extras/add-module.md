<!-- sync-kit prompt: add-module v1 -->
# Extra — Add a module

You are changing an installed sync-kit setup. A new module (a business domain or service, e.g. `billing`) gets its own
note folder under `sync/`. This prompt adds it to `sync/sync.config.json` and regenerates what lists the modules.
Existing notes are never moved.

## Goal

The new module is in `modules` with its own folder, the folder exists (with `.gitkeep`), `sync/README.md` lists it,
every existing note still passes `check`, and `doctor` passes.

## Preconditions

- You are at the repository root, and sync-kit is installed: `node sync/scripts/sync.mjs state show` lists `"01"`
  under `phases`. If not, use `.sync-kit/prompts/01-install.md` instead.

## Inputs

- `sync/sync.config.json` — `modules`, `lang`, `contract.globs`.
- The note folders under `sync/` and the repository contents (read-only).
- The user's answers.

## Steps

1. **Record the note count:** run `node sync/scripts/sync.mjs check` and note the number in its last line (e.g.
   `sync check OK (12 notes)`, or the same in the config language). It must exit `0`; if not, stop and tell the user
   to fix the reported errors first.

2. **Ask the user** for the module name (e.g. `billing`) and its folder relative to `sync/` (default: the same as the
   name). The name must not already be in `modules`, and no other module may use the same folder.

3. **Flat layout first.** If `modules` is `{}` (flat layout), every existing note lives in `sync/notes/` with
   `module: general`. The engine reads them only while a module `general` keeps the folder `notes` (otherwise it
   silently ignores them). Tell the user, then set `modules` to `{ "general": "notes", "<name>": "<folder>" }`. Never
   move or edit the existing notes. If there are no notes in `sync/notes/` yet (only `.gitkeep`), ask the user whether
   to keep `general` anyway or to drop it and delete the empty `sync/notes/` folder.

   Otherwise add `"<name>": "<folder>"` to `modules`. Keep 2-space JSON and change nothing else.

4. **Contract files (optional).** If the module brings new contract files, ask the user whether to add globs for the
   side that owns them under `contract.globs` (syntax: `*`, `?`, `**/`, `**`, no `{a,b}` braces; list the files each
   glob matches today).

5. **Regenerate:**
   ```
   node sync/scripts/sync.mjs init
   ```
   It creates the folder and refreshes the modules table in `sync/README.md` and the INBOX files. If it prints
   `error:` lines, fix the config and rerun. Create an empty file `.gitkeep` in the new folder (git does not track
   empty folders).

6. **Agent rules** — only if step 4 changed `contract.globs` and `decisions.agentFiles` (from
   `node sync/scripts/sync.mjs state show`) is not empty, regenerate the block (one `--file` per path):
   ```
   node sync/scripts/sync.mjs agent-rules --file AGENTS.md --file CLAUDE.md
   ```

7. **Project rules.** If the project-rules block of `sync/README.md` (between `<!-- sync-kit:project-rules:start -->`
   and `<!-- sync-kit:project-rules:end -->`) has an example `new` command without `--module` (flat layout before) or
   lists modules or contract files, update it in the config language. If `sync/ONBOARDING.md` exists, update its
   modules list and example command the same way. Change nothing outside the markers in `sync/README.md`.

8. **Check:**
   ```
   node sync/scripts/sync.mjs check
   ```
   It must exit `0` and report the same number of notes as step 1. A lower number means notes are in a folder that is
   no longer in `modules` (the engine then ignores them silently): put that folder back in `modules` (for a flat
   layout, `"general": "notes"`, step 3) and rerun step 5.

## Hard rules

- Never move, rename or edit existing notes; keep the folder they live in mapped to their `module`.
- Change `sync/sync.config.json` only as listed in steps 3 and 4.
- Never edit the generated block of `sync/README.md`, the agent-rules block or `INBOX*.md` by hand.
- In `sync/README.md`, edit only between the project-rules markers.
- Never write `sync/.kit/state.json` by hand; this prompt does not change state.
- Do not run `git commit`; only suggest it.

## Outputs

- `sync/sync.config.json` with the new module (and `general` → `notes` when the layout was flat).
- The new note folder with `.gitkeep`; regenerated `sync/README.md` generated block and `sync/INBOX*.md`; updated
  project rules (and `sync/ONBOARDING.md` if present).

## Verify

```
node sync/scripts/sync.mjs doctor
```

The exit code must be `0` and no line may start with `✗`. On `✗ note directories exist`, rerun step 5. A
``✗ `sync.mjs check` passes`` line about an out-of-date `sync/INBOX.md` after the change usually means notes dropped
out of the layout: see step 8.

## Handoff

Tell the user to review and commit the changes, e.g. `chore(sync): add module <name>`. From now on, notes of this
module are created with `node sync/scripts/sync.mjs new --module <name> …`.
