<!-- sync-kit prompt: upgrade v1 -->
# Extra — Upgrade the kit

You are upgrading sync-kit in this repository to a newer kit tag. The engine in `sync/scripts/` is replaced by the new
version through `sync.mjs install`; the config, state, generated blocks and agent rules are brought up to date; notes
are not touched.

## Goal

`sync/scripts/` matches the new kit's `MANIFEST.json`, `config.kitVersion`, `state.kitVersion` and
`sync/scripts/VERSION` name the new version, `state.kitRef` names the new tag, the generated blocks and agent rules are
regenerated, and `doctor` passes.

## Preconditions

- You are at the repository root, and sync-kit is installed: `node sync/scripts/sync.mjs state show` lists `"01"`
  under `phases`. If not, use `.sync-kit/prompts/01-install.md` instead.
- The user knows the new tag (e.g. `v1.1.0`). Never use an unpinned branch.
- `git status --porcelain` is empty. If not, show the list to the user and ask whether to continue anyway; stop if
  they say no (a clean tree makes the upgrade easy to review and revert).

## Inputs

- `node sync/scripts/sync.mjs version` (installed version) and `node sync/scripts/sync.mjs state show` (`kitRef`,
  `decisions.ci`, `decisions.agentFiles`).
- The new kit at `.sync-kit/`: `kit/scripts/VERSION`, `kit/scripts/MANIFEST.json`, `CHANGELOG.md`, `kit/ci/`,
  `kit/scripts/templates/<lang>/`.
- `sync/sync.config.json`.

## Steps

1. **Record the current version:** run `node sync/scripts/sync.mjs version` and `node sync/scripts/sync.mjs state show`;
   note the version and `kitRef`.

2. **Put the new tag into `.sync-kit/`.**
   - If `.sync-kit/.git` exists: read the kit URL with `git -C .sync-kit remote get-url origin`, then replace the
     folder (it is git-ignored and holds only the kit):
     ```
     node -e "require('fs').rmSync('.sync-kit',{recursive:true,force:true})"
     git clone -b <new tag> --depth 1 <kit url> .sync-kit
     ```
   - Otherwise (tarball install), ask the user to download the tarball of the new tag and extract it into
     `.sync-kit/` in place of the old content, and wait.
   - If the agent has no network (e.g. Codex cloud), ask the user to change the tag in the environment setup script
     and start a new session.

   `git check-ignore .sync-kit` must still print `.sync-kit`.

3. **Compare versions:** `node .sync-kit/kit/scripts/sync.mjs version` prints the new version. If it is the same as
   or older than the installed one, tell the user and stop (to repair a damaged engine with the same version, run only
   steps 5 and 11).

4. **Read the changelog.** In `.sync-kit/CHANGELOG.md`, read every section newer than the installed version. Summarise
   for the user: breaking changes, new or renamed config fields, changed templates (README, `_TEMPLATE.md`, agent
   rules), changed CI templates, and any manual step. Ask the user to confirm before continuing.

5. **Install the new engine.** First list the files the install will **delete** from `sync/scripts/` (files not in the
   new manifest):
   ```
   node -e "const fs=require('fs'),p=require('path');const m=JSON.parse(fs.readFileSync('.sync-kit/kit/scripts/MANIFEST.json','utf8'));const w=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(p.join(d,e.name)):[p.relative('sync/scripts',p.join(d,e.name)).split(p.sep).join('/')]);console.log(w('sync/scripts').filter(f=>[f in m,f==='MANIFEST.json'].every(x=>x===false)).join('\n'))"
   ```
   Show the list to the user (empty output = nothing is deleted) and warn: every file in `sync/scripts/` that is not
   part of the new kit is removed, and every kit file is overwritten. Only after the user agrees, run:
   ```
   node .sync-kit/kit/scripts/sync.mjs install --sync-dir sync
   ```
   It prints one `removed (not in manifest): …` line per deleted file and `installed N file(s) into …`. The install
   is not atomic: if it is interrupted or fails, run the same command again (`doctor --phase 01` reports a half-done
   upgrade as `✗ engine files in sync/scripts match MANIFEST.json`). Never copy or edit files in `sync/scripts/`.

6. **Update the versions.** In `sync/sync.config.json`, set `kitVersion` to the content of `sync/scripts/VERSION`
   (change nothing else in this step). Then record the new tag:
   ```
   node sync/scripts/sync.mjs state init --kit-ref <new tag>
   ```
   It keeps the phases and decisions and updates `kitVersion` and `kitRef`.

7. **Config changes from the changelog.** Apply the config changes step 4 found (new fields, renamed fields), with the
   user's confirmation, following `.sync-kit/docs/config.md`. Skip this step when there are none.

8. **Regenerate the generated content:**
   ```
   node sync/scripts/sync.mjs init
   ```
   It refreshes the generated block of `sync/README.md` and the INBOX files and keeps the project-rules block. It never
   overwrites an existing `sync/_TEMPLATE.md`: if the changelog says the note template changed, show the user the
   difference with `git diff --no-index sync/_TEMPLATE.md .sync-kit/kit/scripts/templates/<lang>/_TEMPLATE.md` and
   apply only the changes they approve.

9. **Agent rules.** If `decisions.agentFiles` is not empty, regenerate the block in each file (one `--file` per path):
   ```
   node sync/scripts/sync.mjs agent-rules --file AGENTS.md --file CLAUDE.md
   ```

10. **CI templates.** Compare each installed CI file with the new template, depending on `decisions.ci`:
    - `github`: `git diff --no-index .sync-kit/kit/ci/github/<file> .github/workflows/<file>` for `sync-check.yml`,
      `sync-notify.yml` and `sync-reminder.yml` (those that exist);
    - `gitlab`: `git diff --no-index .sync-kit/kit/ci/gitlab/<file> sync/ci/<file>` for `sync-check.gitlab-ci.yml`
      and `sync-notify.gitlab-ci.yml` (those that exist);
    - `none`: `git diff --no-index .sync-kit/kit/ci/hooks/pre-commit sync/hooks/pre-commit`.

    Differences that are only this project's settings (default branch, the cron value below `# SYNC_KIT_CRON`, runner
    `tags:`, image) are expected. For any other difference, show it to the user and, if they agree, update the file
    to the new template while keeping those settings. Never change other workflows or jobs. If you change
    `sync/hooks/pre-commit`, keep it executable (`git update-index --chmod=+x sync/hooks/pre-commit`).

11. **Check:**
    ```
    node sync/scripts/sync.mjs check
    ```
    It must exit `0`. If new validation rules make notes fail, list the errors to the user with the fix you propose,
    and fix only what they approve.

## Hard rules

- Install the engine only with `node .sync-kit/kit/scripts/sync.mjs install --sync-dir sync`, and only after the user
  saw the list of files it deletes. Never copy, rewrite or edit files in `sync/scripts/`.
- Never write `sync/.kit/state.json` by hand; only through `sync.mjs state`.
- Never delete, move or rewrite notes.
- In `sync/sync.config.json`, change only `kitVersion` and the changes the user approved in step 7.
- Do not change CI files beyond the approved template updates of step 10.
- Do not run `git commit`; only suggest it.

## Outputs

- `sync/scripts/` — the new engine; `sync/sync.config.json` with the new `kitVersion`; `sync/.kit/state.json` with the
  new `kitVersion` and `kitRef`.
- Regenerated `sync/README.md` generated block, `sync/INBOX*.md` and agent rule blocks.
- Optionally updated CI files and `sync/_TEMPLATE.md` (approved changes only).

## Verify

```
node sync/scripts/sync.mjs doctor
```

The exit code must be `0` and no line may start with `✗`. On `✗ engine files in sync/scripts match MANIFEST.json`,
rerun the install of step 5. On `✗ kit versions match …`, redo step 6.

## Handoff

Tell the user to review the diff and commit it, e.g. `chore(sync): upgrade sync-kit to <new tag>`, and to update the
tag wherever the kit is fetched (other clones, the Codex cloud setup script).
