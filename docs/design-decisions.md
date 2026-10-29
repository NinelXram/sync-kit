# Design decisions

Why sync-kit is built the way it is. Each decision has an id (D1–D14) so issues and pull requests can refer to it.

## Guiding principle: smart vs. fixed

The kit splits the work in two:

- **The "smart" part is left to the AI agent**, in the prompts: surveying the project, proposing sides, modules and
  contract globs with evidence, writing the project-specific protocol rules (when a note is required), choosing the
  agent rule files, the CI and the notification channel. This differs from project to project and needs judgement.
- **The "fixed" part is identical in every project**, in `kit/`: frontmatter parser, validation, INBOX, `check`,
  `contract-check`, `notify` / `remind`, agent-rules block insertion, `doctor`. The agent **never copies or rewrites**
  it: the engine installs itself (`sync.mjs install`) and `doctor` verifies every file's sha256 against
  `MANIFEST.json`. Every difference between projects lives in **one file**, `sync/sync.config.json`. The installation
  state `sync/.kit/state.json` is likewise written only through the engine (`sync.mjs state …`).

Every phase ends with a **deterministic check** (`sync.mjs doctor --phase NN`), never with "the agent thinks it looks
fine".

## Decisions

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Language | Prompts and repository docs are **English** (every agent follows English best), with a parallel `README.vi.md`. Artifacts generated in the target project (protocol README, template, INBOX, chat messages) are `en` or `vi` per `config.lang`. |
| D2 | Distribution | The kit always lives **inside the target repository** at `.sync-kit/` (git-ignored), fetched by tag: `git clone -b v1.0.0 --depth 1` or the tag's tarball. Prompts call the engine by a **fixed path**, `node .sync-kit/kit/scripts/sync.mjs …`, never through a shell variable (an unset variable is silently empty on PowerShell). Reason for living in the repository: sandboxed agents (Codex cloud, Claude Code web, Cursor) usually cannot read folders outside the workspace; on Codex cloud (network off while the agent runs) the clone goes in the setup script. An unpinned `main` is never used. |
| D3 | CI in v1 | **GitHub Actions**, **GitLab CI (including self-hosted, GitLab ≥ 13.7)** and **none**. GitLab jobs live in their own files `sync/ci/*.gitlab-ci.yml` (committed) and are attached to the existing `.gitlab-ci.yml` with **one `include: local` line** — the only line the kit adds to a project's CI file, and only after asking. Reminders run from a **pipeline schedule** (created in the UI, variable `SYNC_REMIND=1`); self-hosted runners may use a shell executor, so the prompt asks for the runner tag and whether the runner has Node ≥ 18. **None** means a committed `pre-commit` hook in `sync/hooks/`, installed via `core.hooksPath` or an existing husky / lefthook / pre-commit setup — best effort; `doctor` only warns when the current machine has not installed it. The hook must be tracked with the exec bit (`100755`, set with `git update-index --chmod=+x` because commits from Windows lose it) — `doctor` reports an error otherwise. Changing `core.hooksPath` hides old hooks in `.git/hooks/`, so the prompt asks first and `doctor` warns. Notifications (D4) need CI: with `ci: none`, phase 04 only allows `channel: none`. |
| D4 | Notification channels in v1 | **Telegram**, **Google Chat** (a Space's incoming webhook — posts to the Space only, cannot mention individuals) and `none`. Slack and Discord are planned for v1.1. Adapter architecture. Long messages are **split** at the channel limit (4096 characters for both) without losing content, and split before rendering so a cut never lands inside an HTML tag or entity. On Google Chat every `notify` message about one note goes to **one thread** (thread key = note id); `remind` posts a new message. Multi-part messages are sent ≥ 1.1 s apart (webhook rate limit). A network error (self-hosted runner without internet) prints the channel and a proxy hint — never the webhook URL — and exits 1. |
| D5 | Dashboard | **Not in v1** (planned for v1.1 as a phase 06). v1 only keeps the optional `notify.siteUrl`: when set, reminders end with one link line, so a project that already publishes its notes keeps that link. An existing site-deploy workflow is never touched. |
| D6 | Topology | v1 supports `monorepo` and `single` (developers plus QA/PO around one codebase). **`hub`** (contracts in a separate repository) is planned for v1.1: agents creating notes in another repository and checking pull-request links from code repositories are not yet well enough defined. Submodules are not supported. |
| D7 | Agents | A marked rules block is inserted into `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/sync-kit.mdc`, `GEMINI.md` or `.github/copilot-instructions.md` — phase 02 picks only the files the team actually uses. Skills / slash commands are planned for v1.1. |
| D8 | Runtime | **Node ≥ 18 is required**, zero dependencies (18 is kept so older machines work, despite being end-of-life). The kit's own CI tests Node **18 / 22 / 24**; workflow templates use `node-version: 22`. No Python port in v1. |
| D9 | Backlog | No integration. Notes point to any backlog (Jira, Linear, issues, a `tasks/` folder) through `refs`. |
| D10 | Name / license | `sync-kit`, **MIT**. Tests and fixtures use neutral fake names (`XYZ-FE-003`, `@alice`). |
| D11 | INBOX | `config.inbox.commit` (default `true`). With `false`, INBOX files are git-ignored and `check` does not compare them — for teams with many parallel pull requests that would otherwise conflict on INBOX. |
| D12 | Strict checks | `config.strict.enabled` (default `true`) with `strict.since` (installation day, **local time**): a status change needs a matching Discussion entry; `applied` needs a reference; `disputed` / `n/a` need a reason. Notes created before `since` are exempt — **even when edited after installation** (deliberate; stated in [protocol.md](protocol.md#strict-checks)). An entry's status is the **first word** after the dash (the rest, e.g. `(XYZ-FE-003)`, counts as text). Accepted vocabulary = the five target statuses plus `raised`, `reopened`, `verified`, `confirmed`, `withdrawn`, `reply`, `note`. Unknown statuses produce a **warning**, never a block. |
| D13 | Compatibility | The note format — frontmatter, the type / priority / status enums, the id `<YYYY-MM-DD>-<from>-<slug>` and the entry heading `### [SIDE] date @handle — status` — is **kept stable**, so repositories that already keep hand-made notes in this format can adopt the kit with `prompts/extras/adopt-existing.md`. |
| D14 | Dates | Every date the engine generates (`created`, the suggested `strict.since`) is the **machine's local date**, never `toISOString()` (UTC) — otherwise, in a time zone ahead of UTC, shortly after midnight, a new note would get yesterday's date and be treated as "before since". |

## Out of scope for v1

Dashboard / site, `hub` topology, Bitbucket CI, Slack, Discord, Teams, per-person mentions on Google Chat, a
two-way Google Chat app, a Python engine, skills / slash commands, Jira / Linear sync.
