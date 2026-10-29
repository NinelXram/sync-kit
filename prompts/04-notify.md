<!-- sync-kit prompt: 04-notify v1 -->
# Phase 04 — Notifications

You are installing sync-kit into this repository. The engine, `sync/`, the agent rules and the CI check are in place.
This phase connects the team chat: on every push to the default branch, CI announces new, disputed and closed notes
(`sync.mjs notify`), and a scheduled job posts a digest of the notes waiting on each side (`sync.mjs remind`).

## Goal

`notify.channel` (Telegram, Google Chat or none) is the same in `sync/sync.config.json` and in state; with a channel,
the notify and reminder jobs exist in CI, `notify.managers` is filled for Telegram, and the user knows which secrets to
add and (on GitLab) how to create the Pipeline schedule. Without a channel, the phase is recorded as `skipped`.

## Preconditions

- You are at the repository root.
- Phase 03 is done or skipped: `node sync/scripts/sync.mjs state show` lists `"03"` under `phases`. If not, stop and
  tell the user to run `.sync-kit/prompts/03-ci.md` first.
- `decisions.ci` is `github` or `gitlab`. If it is `none`: notifications are sent by CI jobs, so a project without CI
  cannot send any. Tell the user this, make sure `"channel": "none"` is set under `notify` in `sync/sync.config.json`
  (change nothing else there), then run these two commands and stop (go straight to Verify):
  ```
  node sync/scripts/sync.mjs state decide --channel none
  node sync/scripts/sync.mjs state phase 04 skipped
  ```

## Inputs

- `node sync/scripts/sync.mjs state show` — `decisions.ci`, `decisions.channel`.
- `sync/sync.config.json` — `sides`, `paused`, `notify` (an adopted repository may already have `managers` and
  `siteUrl`).
- `sync/.kit/discovery.md` — team time zone (if found), runner tags, the existing sync workflows to replace (adopted
  repositories).
- Templates in the kit: `.sync-kit/kit/ci/github/sync-notify.yml`, `.sync-kit/kit/ci/github/sync-reminder.yml`,
  `.sync-kit/kit/ci/gitlab/sync-notify.gitlab-ci.yml`.
- The user's answers. Never ask for secret values.

## Steps

1. **Choose the channel.** Show the user the channel recorded in state and ask which one the team uses: `telegram`,
   `gchat` (Google Chat) or `none`.
   - If the answer differs from state, record it:
     ```
     node sync/scripts/sync.mjs state decide --channel <telegram|gchat|none>
     ```
   - `none`: set `"channel": "none"` under `notify` in `sync/sync.config.json` (change nothing else), run
     `node sync/scripts/sync.mjs check`, then `node sync/scripts/sync.mjs state phase 04 skipped`, and go to Verify.

2. **Telegram only — managers and bot.**
   1. For every side in `sides` that is not in `paused`, ask for the Telegram usernames to mention when a note waits on
      that side: one or more `@username` strings (the Telegram username, not the display name). Paused sides are
      optional. Show the values already in `notify.managers` (adopted repositories) and ask the user to confirm them.
   2. Tell the user how to get the two secrets themselves (they never paste them into this chat):
      - create a bot with Telegram's `@BotFather` (`/newbot`) — it returns the **bot token**;
      - add the bot to the team group;
      - get the group's **chat id** (a negative number): send a message that mentions the bot in the group, then open
        `https://api.telegram.org/bot<token>/getUpdates` in a browser and read `chat.id`.

3. **Google Chat only — webhook.** Do not ask for managers: Google Chat webhooks post into a Space and cannot mention
   people (`notify.managers` is ignored). Tell the user how to create the webhook themselves: open the Space →
   **Apps & integrations** → **Webhooks** → **Add webhook**, give it a name, save, and copy the URL. This needs Google
   Workspace (not a personal Gmail account), and a Workspace admin may have turned webhooks off; if the menu is
   missing, the user must ask their admin. The URL contains a key and a token: it is a secret.

4. **Site link (optional).** Ask whether the team has a page that shows sync progress (a dashboard, a board, a page
   that renders the notes). If yes, take its URL (must start with `http://` or `https://`); reminders add one line
   linking to it. Otherwise use `""`.

5. **Write the config.** In `sync/sync.config.json`, under `notify`, set:
   - `"channel"`: the chosen channel;
   - `"managers"`: for `telegram`, side id → list of usernames, e.g. `{ "be": ["@alice"], "fe": ["@bob", "@carol"] }`;
     for `gchat`, keep the existing value;
   - `"siteUrl"`: the URL from step 4 or `""`.

   Change nothing else in the file (`remindMaxItems` stays as it is). Never put a token, chat id or webhook URL in it.
   Then run:
   ```
   node sync/scripts/sync.mjs check
   ```
   It must exit `0`.

6. **Existing notification workflows** (adopted repositories; listed in `sync/.kit/discovery.md` as sync workflows):
   a workflow or job that already posts sync notifications would send every message twice once the kit's jobs run.
   Show each one to the user and ask whether to delete it (or let the kit file of step 7/8 replace it when it has the
   same path). Delete or replace only what the user approves; leave every other workflow and job untouched.

7. **`ci: github`**
   1. Copy both workflows (the command fails instead of overwriting):
      ```
      node -e "const fs=require('fs');fs.mkdirSync('.github/workflows',{recursive:true});for(const f of ['sync-notify.yml','sync-reminder.yml'])fs.copyFileSync('.sync-kit/kit/ci/github/'+f,'.github/workflows/'+f,fs.constants.COPYFILE_EXCL)"
      ```
      If it fails with `EEXIST`, at least one of the two files already existed and the copy stopped there. For each of
      the two files that existed before, show it to the user and ask before replacing it. Then copy each file that is
      still missing, and each existing file the user agreed to replace, with this command (replace `<file>` with
      `sync-notify.yml` or `sync-reminder.yml`):
      ```
      node -e "require('fs').copyFileSync('.sync-kit/kit/ci/github/<file>','.github/workflows/<file>')"
      ```
      If the user refuses to replace an existing file, keep it unchanged: `doctor` only checks that both files exist,
      so tell the user that file keeps its old behaviour.
   2. In `.github/workflows/sync-notify.yml`, replace `__DEFAULT_BRANCH__` with the repository's default branch (the
      output of `git symbolic-ref --short refs/remotes/origin/HEAD` without the leading `origin/`; ask the user if that
      command fails).
   3. **Reminder time.** Ask the user at what local time and on which days the reminder should run (suggest 09:00,
      Monday to Friday) and the team's time zone as a UTC offset (use discovery if it found one). GitHub cron runs in
      **UTC**, so convert: UTC hour = local hour − offset.
      - Result below 0: add 24 and move every day one day back (`1-5` becomes `0-4`).
      - Result 24 or more: subtract 24 and move every day one day forward (`1-5` becomes `2-6`).
      - Examples: 09:00 at UTC+7 → `0 2 * * 1-5`; 06:30 at UTC+7 → `30 23 * * 0-4`; 09:00 at UTC−5 → `0 14 * * 1-5`.
      - If the time zone has daylight saving time, tell the user the reminder moves by one hour local time when the
        clocks change (GitHub has no time zone setting).
   4. In `.github/workflows/sync-reminder.yml`, keep the line `    # SYNC_KIT_CRON` exactly as it is and replace only
      the value on the `- cron:` line right below it, e.g. `    - cron: '0 2 * * 1-5'`. Change nothing else in either
      file.

8. **`ci: gitlab`**
   1. Copy the job file:
      ```
      node -e "const fs=require('fs');fs.mkdirSync('sync/ci',{recursive:true});fs.copyFileSync('.sync-kit/kit/ci/gitlab/sync-notify.gitlab-ci.yml','sync/ci/sync-notify.gitlab-ci.yml',fs.constants.COPYFILE_EXCL)"
      ```
      If `sync/ci/sync-notify.gitlab-ci.yml` already exists, compare it with the template and ask the user before
      replacing it.
   2. **Runner.** Use the same runner as the `sync-check` job: read the `tags:` line and the `image:` line of
      `sync/ci/sync-check.gitlab-ci.yml` (phase 03) and confirm them with the user. The file has **two** jobs
      (`sync-notify` and `sync-remind`), each with a line `  # SYNC_KIT_RUNNER_TAGS`: replace both lines (keep the
      two-space indent) with the same `  tags: [...]` line, or delete both when no tag is needed. If phase 03 replaced
      `node:22` with an internal image, replace both `image: node:22` lines the same way.
   3. These jobs call `api.telegram.org` or `chat.googleapis.com`. If the runner has no internet access, tell the user
      to read "Self-hosted runner without internet access" in `.sync-kit/docs/config.md`.
   4. **Include the job — ask the user first.** Show the exact change and wait for consent, then add exactly one item
      to the `include:` list of `.gitlab-ci.yml`, aligned with the existing items:
      `- local: 'sync/ci/sync-notify.gitlab-ci.yml'`. Use one `- local:` item per file, never a wildcard path (the kit
      supports GitLab 13.7+; wildcard includes need 13.11). If `.gitlab-ci.yml` has no `include:` list, follow step
      3.5 of `.sync-kit/prompts/03-ci.md` with this file name. Change nothing else in `.gitlab-ci.yml`.
   5. **Pipeline schedule** (the reminder). Doctor cannot create or check it. Print these instructions for the user:
      - in GitLab: **Build → Pipeline schedules** (older versions: **CI/CD → Schedules**) → **New schedule**;
      - interval pattern: a cron for the reminder time the user wants, e.g. `0 9 * * 1-5` for 09:00 Monday to Friday;
        choose the team's time zone in **Cron timezone** (GitLab converts it, no UTC conversion needed);
      - target branch: the default branch;
      - variable: key `SYNC_REMIND`, value `1`;
      - keep **Activated** checked and save.
   6. **Other jobs in the scheduled pipeline.** The schedule creates a full pipeline on the default branch. Read
      `.gitlab-ci.yml` and every file it includes (follow `extends:` to hidden `.job` templates) and list for the user
      every job that has none of `rules:`, `only:` or `except:` — those jobs also run in every scheduled reminder
      pipeline (builds, deploys, …). Also tell the user if a top-level `workflow:` block has `rules:` that do not let a
      `schedule` pipeline through: then the reminder never runs. Changing other jobs or `workflow:` is the user's
      decision; do not edit them.

9. **Secrets.** Print the list for the user to add themselves — never ask for the values, never write them in a file,
   never print them:
   - `telegram`: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`;
   - `gchat`: `GCHAT_WEBHOOK_URL`.

   Where:
   - **GitHub:** repository **Settings → Secrets and variables → Actions → New repository secret**, one secret per
     name.
   - **GitLab:** **Settings → CI/CD → Variables → Add variable**, one variable per name. Turn on **Protected** (only
     pipelines on protected branches can read it — the default branch must be protected, otherwise the jobs do not see
     the variable). Turn on **Masked** when GitLab allows it; if GitLab refuses Masked for a value (webhook URLs contain
     `?`, `&` and `=`), keep it Protected only and never `echo` that variable in any job.

   If the user pastes a secret into the chat anyway, do not copy it anywhere, and tell them to revoke it and create a
   new one.

10. **Dry run.** Print the messages without sending anything:
    ```
    node sync/scripts/sync.mjs notify --before HEAD~1 --after HEAD --dry-run
    node sync/scripts/sync.mjs remind --dry-run
    ```
    Both must exit `0`. `No events to notify.` and `No sync notes waiting — no reminder sent.` (or the same text in the
    config language) are normal when no note changed in the last commit or no note is open. Show the user any message
    they print, including the mention line for Telegram.

## Hard rules

- Never ask for, write or print a secret (bot token, chat id, webhook URL). Secrets live only in CI secrets / CI/CD
  variables.
- Never modify the project's existing CI workflows or jobs. The only allowed changes, each only after the user agreed:
  the single `include` item in `.gitlab-ci.yml`, replacing an existing kit workflow file of the same name, and
  deleting an old sync notification workflow/job (step 6).
- In the kit templates, change only `__DEFAULT_BRANCH__`, the cron value below `# SYNC_KIT_CRON`, the
  `# SYNC_KIT_RUNNER_TAGS` lines and (if needed) the `node:22` image. Keep the `# SYNC_KIT_CRON` comment line.
- In `sync/sync.config.json`, change only `notify.channel`, `notify.managers` and `notify.siteUrl`.
- Never write `sync/.kit/state.json` by hand; only through `sync.mjs state`. When the channel changes, run
  `state decide --channel …` too: `doctor` requires the same channel in state and config.
- Never send a real message in this phase: run `notify` and `remind` only with `--dry-run`.
- Do not run `git commit`; only suggest it.

## Outputs

- `sync/sync.config.json` — `notify.channel`, `notify.managers` (Telegram), `notify.siteUrl`.
- `github`: `.github/workflows/sync-notify.yml` and `.github/workflows/sync-reminder.yml`.
- `gitlab`: `sync/ci/sync-notify.gitlab-ci.yml`, one `include` item in `.gitlab-ci.yml`, printed Pipeline schedule
  instructions and the list of jobs that also run in the schedule.
- The printed list of secrets to add.
- `channel: none`: phase `04` recorded as `skipped`.

## Verify

```
node sync/scripts/sync.mjs doctor --phase 04
```

The exit code must be `0` and no line may start with `✗`. Acceptable `!` warnings: `Pipeline schedule (variable
SYNC_REMIND=1) must be created by hand in the GitLab UI — doctor cannot check it` (GitLab), and the warnings accepted in
phase 03. On `✗ every active side has managers in notify.managers`, redo step 2.1 for the sides it names. On
`✗ notify channel matches`, rerun `state decide --channel …` or fix `notify.channel` so both are the same.

## Handoff

If the phase was not skipped, record it:

```
node sync/scripts/sync.mjs state phase 04 done
```

Tell the user:

- add the secrets of step 9 (and, on GitLab, create the Pipeline schedule of step 8.5) before merging;
- review and commit the changes, e.g. `ci(sync): add sync notifications`;
- after merging, test the reminder once: GitHub → **Actions → sync-reminder → Run workflow**; GitLab → the schedule's
  **Run** (play) button. A job log line `missing env …` means a secret is missing or not readable by that branch;
- GitHub disables scheduled workflows in public repositories after 60 days without activity; re-enable it in the
  Actions tab if that happens;
- Cloud agents (Codex cloud, Claude Code web) start every task from the pushed branch: either continue with the next phase in this same task, or commit and push this phase's output (including `sync/.kit/`) to the working branch before starting the next task.

Next: `.sync-kit/prompts/05-rollout.md`.
