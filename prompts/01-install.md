<!-- sync-kit prompt: 01-install v1 -->
# Phase 01 — Install

You are installing sync-kit into this repository. Phase 00 already surveyed the project and recorded the user's
decisions. This phase installs the engine, writes the configuration and creates the `sync/` folder with the
protocol README.

## Goal

The engine is installed in `sync/scripts/` (identical to the kit), `sync/sync.config.json` describes this project,
`sync/` is initialised, and the project-rules block of `sync/README.md` states this project's own rules.

## Preconditions

- You are at the repository root and the kit is at `.sync-kit/`.
- Phase 00 is done. Check with `node .sync-kit/kit/scripts/sync.mjs state show --sync-dir sync`: the output must have
  `"00"` under `phases` and the decisions `topology`, `ci`, `channel`, `lang`. If not, stop and tell the user to run
  `.sync-kit/prompts/00-discover.md` first.
- `sync/.kit/discovery.md` exists.

## Inputs

- `sync/.kit/state.json` (read it with `state show`, never edit it) — decisions: `topology`, `ci`, `channel`, `lang`,
  `agentFiles`.
- `sync/.kit/discovery.md` — draft config, sides, modules, contract globs, reference format for `refs`, QA side.
- `.sync-kit/docs/config.md` — every config field, its default and its validation.

## Steps

1. **Install the engine** (run from the repository root):
   ```
   node .sync-kit/kit/scripts/sync.mjs install --sync-dir sync
   ```
   It must print `installed N file(s) into …/sync/scripts`. This is the only way to put the engine in place: never
   copy, rewrite or edit any file under `sync/scripts/`.

2. **Get today's date** for `strict.since`:
   ```
   node sync/scripts/sync.mjs state today
   ```
   Use exactly the printed `YYYY-MM-DD`. Never guess or compute the date yourself.

3. **Write `sync/sync.config.json`** (2-space JSON, UTF-8, no comments) from the draft in `sync/.kit/discovery.md`,
   overridden by the decisions in state:
   - `kitVersion`: the content of `sync/scripts/VERSION` (e.g. `"1.0.0"`);
   - `lang`, `topology`: from state decisions;
   - `sides`, `modules`, `contract.globs`: from discovery as confirmed by the user;
   - `paused`: `[]` unless the user said otherwise;
   - `inbox`: `{ "commit": true }`;
   - `strict`: `{ "enabled": true, "since": "<date from step 2>" }`;
   - `notify`: `{ "channel": "<state decision>", "managers": {}, "remindMaxItems": 5, "siteUrl": "" }` — managers are
     filled in phase 04. Never put tokens, chat ids or webhook URLs in this file.

   Field reference: `.sync-kit/docs/config.md`; complete examples: `.sync-kit/examples/*.config.json`.

4. **Initialise `sync/`:**
   ```
   node sync/scripts/sync.mjs init
   ```
   It creates the note directories, `sync/README.md`, `sync/_TEMPLATE.md` and `sync/INBOX.md`. If it prints
   `error:` lines, the config is invalid: fix `sync/sync.config.json` and rerun. Running it twice is safe.

5. **Keep empty note directories in git.** Git does not track empty folders. For every note directory (each value of
   `modules`, or `notes` when `modules` is `{}`) that has no file yet, create an empty file `.gitkeep` inside it
   (e.g. `sync/notes/.gitkeep`).

6. **Write the project-rules block of `sync/README.md`.** Replace everything between
   `<!-- sync-kit:project-rules:start -->` and `<!-- sync-kit:project-rules:end -->` (including the `TODO` line) with
   this project's rules, written in the config language (`lang`). Use real values from the config and discovery:
   - **When a note is required here:** list the contract globs per side in plain words (e.g. "any change to
     `apps/api/src/**/*.controller.ts` or `apps/api/openapi.yaml` that changes a request, response, error code or
     permission").
   - **Example command** with a real module and real sides, e.g.
     `node sync/scripts/sync.mjs new --module billing --from be --to fe,qa --type feature --slug add-refunds --title "Add refunds endpoint" --refs "ABC-123"`
     (no `--module` when the layout is flat).
   - **References:** the `refs` format found in discovery (e.g. Jira keys `ABC-123`, issues `#123`, `PR-47`).
   - **QA:** which side is QA and what QA does with notes (if the project has a QA side).
   Do not change anything outside the two markers; never leave a line starting with `TODO` inside them.

7. **Run the check:**
   ```
   node sync/scripts/sync.mjs check
   ```
   It must print `sync check OK` (or the equivalent in the config language) and exit `0`.

## Hard rules

- Install the engine only with `sync.mjs install`. Never copy, rewrite, reformat or edit files in `sync/scripts/`.
  `doctor` compares them with `MANIFEST.json` and fails on any difference.
- Never write `sync/.kit/state.json` by hand; only through `sync.mjs state`.
- Take `strict.since` only from `sync.mjs state today`.
- In `sync/README.md`, edit only between the project-rules markers. Never edit the generated block or `INBOX*.md` by
  hand; the engine regenerates them.
- No secrets in any file.
- Do not touch files outside `sync/` in this phase (except the `sync/INBOX*.md` line `init` adds to `.gitignore` when
  `inbox.commit` is `false`).
- Do not run `git commit`; only suggest it.

## Outputs

- `sync/scripts/` — the engine, identical to the kit.
- `sync/sync.config.json`.
- `sync/README.md` (protocol, generated tables, project rules), `sync/_TEMPLATE.md`, `sync/INBOX.md`.
- Note directories with `.gitkeep`.

## Verify

```
node sync/scripts/sync.mjs doctor --phase 01
```

Every line must start with `✓` and the exit code must be `0`. On `✗ engine files in sync/scripts match MANIFEST.json`,
rerun step 1 (never patch the files). On `✗ project-rules block …`, redo step 6.

## Handoff

Record the phase and suggest a commit:

```
node sync/scripts/sync.mjs state phase 01 done
```

Tell the user to review and commit everything under `sync/` (plus `.gitignore` if it changed), e.g. with the message
`chore(sync): install sync-kit v1.0.0`. Cloud agents (Codex cloud, Claude Code web) start every task from the pushed branch: either continue with the next phase in this same task, or commit and push this phase's output (including `sync/.kit/`) to the working branch before starting the next task. Next: `.sync-kit/prompts/02-agent-rules.md`.
