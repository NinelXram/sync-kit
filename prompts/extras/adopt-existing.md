<!-- sync-kit prompt: adopt-existing v1 -->
# Extra — Adopt an existing sync system

You are installing sync-kit into a repository that **already** has a hand-made sync-note system: a `sync/` folder with
notes, usually its own script (e.g. `sync/scripts/sync.mjs`) with sides and modules hardcoded, and CI workflows that
check notes or post to a chat. This prompt replaces phases 00 and 01: it maps the existing system onto
`sync/sync.config.json`, installs the kit engine over the old script and keeps every existing note as it is.

## Goal

The kit engine is installed in `sync/scripts/`, `sync/sync.config.json` reproduces the existing system (sides,
paused sides, modules, contract files, chat managers, site link), every existing note still passes
`sync.mjs check`, and phases `00` and `01` are recorded in `sync/.kit/state.json`.

## Preconditions

- You are at the root of the target repository (the folder that contains `.git`).
- The kit is inside the workspace at `.sync-kit/` (cloned from a version tag, see the kit's `prompts/README.md`).
- The repository has a `sync/` folder with existing notes (Markdown files with `---` frontmatter). If it has no
  `sync/` folder, stop and tell the user to use `.sync-kit/prompts/00-discover.md` instead.
- You can run shell commands. If you cannot, print each command, ask the user to run it and paste the output back.

## Inputs

- The repository contents, especially `sync/`, `sync/scripts/`, `sync/README.md` and the CI files (read-only until
  the user confirms).
- The kit at `.sync-kit/` — the engine is `node .sync-kit/kit/scripts/sync.mjs`.
- `.sync-kit/docs/config.md` — every config field, its default and its validation, with contract glob examples.
- `.sync-kit/prompts/00-discover.md` — the survey this prompt reuses (environment check, agent files, CI, language).
- The user's answers to your questions.

## Steps

1. **Check the environment** exactly as in step 1 of `.sync-kit/prompts/00-discover.md` (Node 18+, engine `version`,
   kit tag `<tag>`, `.sync-kit` ignored by git, clean `git status`). Stop at the first failure.

2. **Survey the existing system, read-only.** For every value, record the evidence (repo-relative file path and line,
   or command and output). Never guess a value the repository does not show; ask instead.
   1. **Note folders.** List the folders under `sync/` that contain notes (Markdown files with `---` frontmatter;
      ignore `README.md`, `_TEMPLATE.md`, `INBOX*.md`, `scripts/`, `.kit/`). Count the notes per folder and collect
      the distinct `module`, `from` and `targets` side values found in their frontmatter.
   2. **Old script constants.** In the old script(s) under `sync/scripts/`, look for hardcoded lists of sides (with
      their labels), of paused sides, and of modules with their folders, whatever they are called (e.g. a constant
      like `TEAMS = [...]`). They map to:
      - the list of sides (+ labels) → `sides` (id → label; ids must match `^[a-z][a-z0-9-]*$`);
      - the list of paused sides → `paused`;
      - the module → folder map → `modules` (name → folder relative to `sync/`, e.g. `"billing": "billing"`).
      When there is no such constant, derive `sides` from the `from` / `targets` values and `modules` from the
      `module` values and their folders (step 2.1). Only use the flat layout (`modules: {}`) when every note already
      lives in `sync/notes/` with `module: general`.
   3. **CI and chat settings.** Search all CI files (`.github/workflows/*`, `.gitlab-ci.yml` and the files it
      includes), and the environment they set, for `sync/` and for these settings, whatever their names:
      - per-side chat-manager handles (usually one variable per side, e.g. `NOTIFY_MANAGER_BE`; several handles
        separated by spaces) → `notify.managers.<side>` as a list of handles, e.g.
        `NOTIFY_MANAGER_BE: '@alice @bob'` → `"be": ["@alice", "@bob"]`;
      - a progress / dashboard URL (e.g. `DASHBOARD_URL`) → `notify.siteUrl` (exact value);
      - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` → channel `telegram`; `GCHAT_WEBHOOK_URL` or a Google Chat webhook →
        channel `gchat`; nothing → ask the user.
      Record only variable **names** and handles. Never copy a token, chat id or webhook URL anywhere.
   4. **Workflows.** Classify every CI workflow/job that mentions `sync/`:
      - **sync workflows** — run the old sync script (`check`, `notify`, `remind`, a contract warning). Phase 03
        replaces the check workflow and phase 04 the notify/reminder ones, each after asking the user. Note their
        file paths.
      - **other workflows that only read `sync/**`** (e.g. a job that builds a site from the notes, or a deploy
        triggered by `paths: sync/**`) — they stay exactly as they are. List them for the user; never edit them.
   5. **Contract files.** Turn any existing contract warning (e.g. a `grep -E` regex in the old check workflow) into
      repo-relative globs per side (syntax: `.sync-kit/docs/config.md`; no `{a,b}` braces, one glob per
      alternative). List the files each glob matches today. Without an existing rule, survey as in step 3.4 of
      `00-discover.md`.
   6. **Topology, CI, agent rule files, language, reference format** — as in steps 3.1, 3.5, 3.7, 3.8 and 3.9 of
      `00-discover.md`. The language is the language of the existing notes and `sync/README.md`.
   7. **`sync/README.md`.** Record whether it already contains both marker pairs
      `<!-- sync-kit:generated:start -->` / `<!-- sync-kit:generated:end -->` and
      `<!-- sync-kit:project-rules:start -->` / `<!-- sync-kit:project-rules:end -->`.
   8. **Files the install replaces.** List every file under `sync/scripts/`: `sync.mjs install` overwrites the ones
      the kit also ships and **deletes** all others in that folder.

3. **Write `sync/.kit/discovery.md`** (create `sync/.kit/`) with, in this order:
   - a table `Item | Proposed value | Evidence | Confidence` covering every item of step 2;
   - a complete draft of `sync/sync.config.json` in a fenced `json` block, with `kitVersion` (content of
     `.sync-kit/kit/scripts/VERSION`), `inbox: { "commit": true }` (or `false` if the existing `INBOX*.md` files are
     git-ignored), `strict: { "enabled": true, "since": "<filled in step 6>" }`, `notify.remindMaxItems: 5`;
   - the files under `sync/scripts/` that install will replace or delete; the sync workflows (phases 03/04) and the
     other workflows that read `sync/**` (left untouched);
   - the agent rule files to update and the pointer candidates, the reference format for `refs`, the CI facts;
   - **at most 7 questions**, only for items with `low` confidence or that need a human decision. Always include:
     "May `sync.mjs install` replace the files listed above in `sync/scripts/`?" and, if step 2.7 found missing
     markers, "May I append the missing sync-kit marker pairs at the end of `sync/README.md` (nothing else in the file
     changes)?".

4. **Ask the user** the questions and show the table. Apply their answers to `sync/.kit/discovery.md`. If the user
   refuses the install, stop: the kit cannot run next to the old script. If the user refuses the README markers, stop
   too: `doctor` requires both marker pairs in `sync/README.md` (without them `init` only warns and leaves the README
   untouched, so phase 01 can never pass). In both cases explain why, leave everything
   else unchanged (only `sync/.kit/discovery.md` was written) and do not record any phase. Only after the user
   explicitly confirms, record the decisions (never write `state.json` yourself):
   ```
   node .sync-kit/kit/scripts/sync.mjs state init --kit-ref <tag> --sync-dir sync
   node .sync-kit/kit/scripts/sync.mjs state decide --topology <monorepo|single> --ci <github|gitlab|none> --channel <telegram|gchat|none> --lang <en|vi> --agent-file <path> --sync-dir sync
   node .sync-kit/kit/scripts/sync.mjs state phase 00 done --sync-dir sync
   ```
   Repeat `--agent-file` once per agent rule file, or use `--no-agent-files`. With `--ci none`, the channel must be
   `none`.

5. **Install the engine** over the old script:
   ```
   node .sync-kit/kit/scripts/sync.mjs install --sync-dir sync
   ```
   It prints one `removed (not in manifest): …` line per deleted old file and `installed N file(s) into …`. Never
   copy, rewrite or edit any file under `sync/scripts/` yourself.

6. **Get today's date** for `strict.since`: `node sync/scripts/sync.mjs state today`. Use exactly the printed
   `YYYY-MM-DD`. Notes created before this date are never checked strictly, so the existing notes keep passing.

7. **Write `sync/sync.config.json`** (2-space JSON, UTF-8, no comments) from the confirmed draft: `kitVersion` = the
   content of `sync/scripts/VERSION`; `lang`, `topology` and `notify.channel` from the state decisions;
   `strict.since` from step 6; `notify.managers` and `notify.siteUrl` from step 2.3. No tokens, chat ids or webhook
   URLs.

8. **README markers.** If step 2.7 found both marker pairs, skip this step. Otherwise, with the user's consent, append
   the missing pair(s) at the end of `sync/README.md`, after one blank line, exactly:
   ```
   <!-- sync-kit:generated:start -->
   <!-- sync-kit:generated:end -->

   <!-- sync-kit:project-rules:start -->
   <!-- sync-kit:project-rules:end -->
   ```
   Do not change, reformat or translate any other line of the existing README. If the user now refuses, stop: explain
   that the kit needs both marker pairs, do not run the next steps and do not record phase `01` (the engine is
   installed but unused; rerun this prompt when the user agrees).

9. **Initialise:** `node sync/scripts/sync.mjs init`. It fills the generated block of `sync/README.md`, regenerates
   `INBOX*.md` and keeps the existing `_TEMPLATE.md`. If it prints `error:` lines, fix `sync/sync.config.json` and
   rerun. If a note folder from `modules` has no file, add an empty `.gitkeep` in it. Then run
   `git diff --stat sync/README.md`: the engine writes LF line endings, so a README checked out with CRLF line
   endings may show every line as changed. If so, tell the user it is a line-ending-only change (`git diff --ignore-cr-at-eol`
   shows the real diff; `core.autocrlf` or `.gitattributes` decide what is committed).

10. **Project rules.** Write the content between `<!-- sync-kit:project-rules:start -->` and
    `<!-- sync-kit:project-rules:end -->` in the config language, as in step 6 of `.sync-kit/prompts/01-install.md`
    (contract files per side, an example `new` command with a real module and real sides, the `refs` format, the QA
    side). Keep it short when the rest of the README already explains the protocol. Never leave a line starting with
    `TODO` inside the markers.

11. **Stale references.** Search `sync/README.md`, `sync/_TEMPLATE.md` and the agent rule files for mentions of the
    old setup that the kit replaced: the old script constants found in step 2.2 (the lists of sides, paused sides and
    modules) and the workflow variables found in step 2.3 (chat-manager handles, dashboard URL), and sentences
    saying that sides, paused sides, modules, chat managers or the site link are set in the old script or in a
    workflow `env` (search for the script and workflow file names too, not only the constant names). Show each line to the user with its replacement (e.g.
    "`paused` in `sync/sync.config.json`", "`notify.managers` in `sync/sync.config.json`") and ask whether to update
    them. Edit only the approved lines, changing only those words; otherwise leave the files as they are.

12. **Check the existing notes:**
    ```
    node sync/scripts/sync.mjs check
    ```
    - Exit `0` (warnings are fine): continue.
    - `error:` lines on notes (frontmatter, folder, `id`): **list them to the user first**, grouped by note, with the
      fix you propose for each, and wait for approval. Fix only the approved notes, only the reported fields; never
      rewrite or reformat a note's body. If the errors come from the config (e.g. a missing side or module), fix
      `sync/sync.config.json` instead of the notes.
    - Errors about the Discussion section (`targets.<side> is … but the last … entry …`, missing reference or
      reason) on notes created on or after `strict.since` (e.g. notes written on the install day): list them to the
      user with the entry heading you would add or fix (format `### [<LABEL>] <YYYY-MM-DD> <@handle> — <status>`)
      and let the user decide; edit only the approved headings/entries, with consent. Never move `strict.since` to
      silence these errors.
    - **If the user declines** a fix for any note error (frontmatter or Discussion), stop: list the notes that still
      fail and why, tell the user that `check` and `doctor --phase 01` keep failing until they are fixed, and do not
      record phase `01`. Rerun this prompt (or just step 12 and Verify) once the user has fixed or approved them.
    - An error that only says an `INBOX*.md` file is out of date: run `node sync/scripts/sync.mjs inbox` and rerun
      `check`.

## Hard rules

- Never delete, move, rename or rewrite existing notes. The only allowed note edits are the ones the user approved
  in step 12: the listed frontmatter fields, and the listed Discussion entry headings/entries.
- Run `sync.mjs install` only after the user agreed to replace the listed files in `sync/scripts/`. Never copy,
  rewrite or edit files in `sync/scripts/` by hand.
- In `sync/README.md`, add only the missing marker pairs (with consent), edit between the project-rules markers,
  and change only the stale-reference words the user approved in step 11. Never touch the rest of the file.
- Never modify CI workflows in this prompt. Workflows that read `sync/**` but are not sync workflows (e.g. a site
  deploy) are never modified by any phase; only list them.
- Never write `sync/.kit/state.json` by hand; only through `sync.mjs state`. Take `strict.since` only from
  `sync.mjs state today`.
- Never copy secrets (tokens, chat ids, webhook URLs) into any file or into the chat.
- Do not create or modify files outside `sync/`, except the `.sync-kit/` line in `.gitignore` (with consent), the
  `sync/INBOX*.md` line that `init` adds to `.gitignore` when `inbox.commit` is `false`, and the approved
  stale-reference lines of step 11 in agent rule files (with consent).
- Do not run `git commit`; only suggest it.

## Outputs

- `sync/.kit/discovery.md` — mapping table with evidence, draft config, replaced files, workflow list, questions and
  answers.
- `sync/.kit/state.json` — written by `sync.mjs state`: decisions, phases `00` and `01` done.
- `sync/scripts/` — the kit engine (old script replaced).
- `sync/sync.config.json`, `sync/README.md` with the two marker blocks filled, regenerated `sync/INBOX*.md`.

## Verify

```
node sync/scripts/sync.mjs doctor --phase 01
```

Every line must start with `✓` and the exit code must be `0`. On `✗ engine files in sync/scripts match MANIFEST.json`,
rerun step 5 (never patch the files). On `✗ sync/README.md has the generated and project-rules marker pairs`, the markers are missing: redo
step 8 only with the user's consent; if the user refuses, stop as described there (phase `01` stays unrecorded) —
do not retry. On `✗ project-rules block …`, redo step 10. On `✗ sync check passes`, go back to step 12 once: if the
user declines the remaining fixes, stop as described there (phase `01` stays unrecorded) — do not retry.

## Handoff

Record the install phase:

```
node sync/scripts/sync.mjs state phase 01 done
```

Tell the user:

- the old script was replaced. The existing sync workflows keep working until phases 03/04 replace them **only if**
  they call the same subcommands the engine has (`check`, `notify --before … --after …`, `remind`) and pass the
  secrets under the kit's names (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` or `GCHAT_WEBHOOK_URL`). Name every
  workflow step that calls another subcommand or flag, or other secret names: it breaks until phase 03 (check) or
  04 (notify/reminder) replaces it. Chat managers and the site link now come from `sync/sync.config.json`, not from
  the workflow environment;
- the workflows that only read `sync/**` (listed in discovery) were not touched;
- review and commit everything under `sync/`, plus `.gitignore` and the agent rule files changed in step 11 if any,
  e.g. `chore(sync): adopt sync-kit <tag>`.

Next: `.sync-kit/prompts/02-agent-rules.md`.
