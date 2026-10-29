<!-- sync-kit prompt: uninstall v1 -->
# Extra — Uninstall

You are removing sync-kit from this repository. Everything the kit created or changed is listed first and removed only
after the user confirms; the sync notes themselves are **kept** as history.

## Goal

The engine, config, state, generated files, CI jobs, hook and agent-rule blocks of sync-kit are gone; every note and
note folder is still there; the user knows what to remove by hand outside the repository (secrets, Pipeline schedule,
webhook).

## Preconditions

- You are at the repository root.
- The kit is at `.sync-kit/` (needed for the final check). If it is missing, ask the user to fetch it again (see the
  kit's `prompts/README.md`, section "Setup") or accept skipping the final `doctor` run.
- `git status --porcelain` is empty. If not, show the list to the user and ask whether to continue anyway; stop if
  they say no.

## Inputs

- `node sync/scripts/sync.mjs state show` — `decisions.ci`, `decisions.agentFiles`, `decisions.channel` (if the
  engine is already gone, read `sync/.kit/state.json` as text).
- `sync/sync.config.json` — `modules` (note folders), `inbox.commit`.
- `sync/.kit/discovery.md` — pointer candidates of phase 02 and, for adopted repositories, what existed before.
- The user's answers.

## Steps

1. **Inventory.** Run `node sync/scripts/sync.mjs doctor` (for the record; failures do not matter here) and
   `node sync/scripts/sync.mjs state show`. Then build the list of what the kit created, checking that each item
   exists:
   - **Engine and kit data:** `sync/scripts/`, `sync/sync.config.json`, `sync/.kit/` (state, discovery, pilot plan).
   - **Generated files:** `sync/INBOX.md` and every `sync/INBOX-<SIDE>.md`.
   - **Docs and template:** `sync/README.md`, `sync/_TEMPLATE.md`, `sync/ONBOARDING.md`. They explain the notes but
     mention commands that will no longer exist: ask the user whether to keep or delete each (default: delete
     `sync/ONBOARDING.md`, keep the other two). In an adopted repository `sync/README.md` existed before the kit: keep
     it, and offer to delete only the two marker pairs and their content (as in step 4).
   - **CI** (by `decisions.ci`):
     - `github`: `.github/workflows/sync-check.yml`, `.github/workflows/sync-notify.yml`,
       `.github/workflows/sync-reminder.yml`;
     - `gitlab`: `sync/ci/sync-check.gitlab-ci.yml`, `sync/ci/sync-notify.gitlab-ci.yml` and their two
       `- local: 'sync/ci/…'` items in the `include:` list of `.gitlab-ci.yml`;
     - `none`: `sync/hooks/pre-commit`, the line `sync/hooks/* text eol=lf` in `.gitattributes` (if present), the
       sync entry in a hook manager (`.husky/pre-commit` line `sh sync/hooks/pre-commit`, the `sync-check` entry in
       `lefthook.yml` / `lefthook.yaml` / `.lefthook.yml` or `.pre-commit-config.yaml`), and `core.hooksPath` if
       `git config core.hooksPath` prints `sync/hooks`.
   - **Agent rule files** from `decisions.agentFiles`: the block from `<!-- sync-kit:start -->` to
     `<!-- sync-kit:end -->`. `.cursor/rules/sync-kit.mdc` was created by the kit: the whole file goes. Pointer lines
     added in phase 02 (one line mentioning `sync/README.md`, in rule files listed as pointer candidates in
     discovery).
   - **`.gitignore`:** the line `sync/INBOX*.md` (added by `init` when `inbox.commit` is `false`).
   - **Kept:** every note folder (the values of `modules`, or `sync/notes/` for a flat layout) with all notes and
     `.gitkeep` files.

2. **Confirm.** Show the whole list to the user, grouped as above, with what will be deleted and what is kept. Ask for
   explicit confirmation and apply their exceptions. Do nothing before they confirm.

3. **Delete files and folders**, one command per path from the confirmed list, for example:
   ```
   node -e "require('fs').rmSync('sync/scripts',{recursive:true,force:true})"
   node -e "require('fs').rmSync('sync/sync.config.json',{force:true})"
   ```
   Never delete a note folder or a note.

4. **Remove the marker blocks.** For each confirmed agent rule file (and `sync/README.md` in an adopted repository),
   delete exactly the lines from `<!-- sync-kit:start -->` to `<!-- sync-kit:end -->`, both marker lines included
   (for `sync/README.md`: from `<!-- sync-kit:generated:start -->` to `<!-- sync-kit:generated:end -->` and from
   `<!-- sync-kit:project-rules:start -->` to `<!-- sync-kit:project-rules:end -->`). Also delete the one empty line
   directly above a block when the block was at the end of the file. Change nothing else. Show the user
   `git diff <file>` for each file. If a file is now empty and did not exist before the kit (check with
   `git log --diff-filter=A --format=%h -- <file>` and the user), ask whether to delete it.

5. **Remove the other edits** from the confirmed list, each shown as a diff to the user:
   - the two `- local: 'sync/ci/…'` items in `.gitlab-ci.yml` (if `include:` then has no item left and the user
     agrees, delete the `include:` line too);
   - the pointer lines, the `.gitattributes` line, the hook manager entry, the `sync/INBOX*.md` line in `.gitignore`;
   - `core.hooksPath`, only if it is `sync/hooks`:
     ```
     git config --unset core.hooksPath
     ```
   Change nothing else in those files.

6. **Look for leftovers:**
   ```
   git grep -n -I --untracked -e "sync-kit:" -e "sync.mjs" -e "SYNC_KIT_" -e "SYNC_REMIND"
   ```
   Every remaining hit must be inside a note, or inside `sync/README.md` / `sync/_TEMPLATE.md` if the user kept them.
   Show any other hit to the user and ask what to do.

## Hard rules

- Never delete, move or edit a note or a note folder.
- Delete or edit nothing before the user confirmed the list of step 2, and nothing outside that list.
- In files the user edited themselves (agent rule files, `.gitlab-ci.yml`, `.gitattributes`, `.gitignore`, hook
  manager configs), remove only the lines the kit added; show the diff of every such file.
- Never modify CI workflows or jobs that are not the kit's.
- Never ask for or print secrets.
- Do not run `git commit`; only suggest it.

## Outputs

- The kit's files, CI jobs, hook and blocks removed as confirmed; notes and note folders unchanged.
- The list of manual steps for the user (Handoff).

## Verify

```
node .sync-kit/kit/scripts/sync.mjs doctor --phase 00 --sync-dir sync
```

This uses the kit copy because the installed engine is gone. It must now **fail** with exit code `1` and exactly two
lines: `✗ sync/.kit/state.json exists and is valid — not found …` and `✗ sync/.kit/discovery.md exists (phase 00
output)` (or the same in the config language) — proof that no install state is left. Also check that every note folder
from step 1 still holds its notes (`git status` shows no deleted file inside them).

## Handoff

Tell the user to do these steps by hand, outside the repository:

- GitHub: delete the repository secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` or `GCHAT_WEBHOOK_URL`
  (**Settings → Secrets and variables → Actions**).
- GitLab: delete the Pipeline schedule with the variable `SYNC_REMIND` (**Build → Pipeline schedules**) and the CI/CD
  variables `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` or `GCHAT_WEBHOOK_URL` (**Settings → CI/CD → Variables**).
- Telegram: remove the bot from the group (and delete it with `@BotFather` if unused). Google Chat: delete the Space
  webhook.
- Every other developer who ran `git config core.hooksPath sync/hooks` runs `git config --unset core.hooksPath`.
- Review and commit the changes, e.g. `chore(sync): remove sync-kit (notes kept)`.
- Finally, `.sync-kit/` can be deleted, together with its line in `.gitignore`.
