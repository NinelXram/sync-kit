<!-- sync-kit prompt: 00-discover v1 -->
# Phase 00 — Discover

You are installing sync-kit, a workflow of "sync notes" that lets the sides of a project (backend, web, mobile, QA, …)
tell each other about changes that affect them. This phase only **looks** at the repository, proposes a configuration
backed by evidence, and records the decisions the user confirms. It installs nothing.

## Goal

Produce `sync/.kit/discovery.md` (evidence-backed proposal + draft config + open questions) and, after the user
confirms, record the decisions in `sync/.kit/state.json` through the engine.

## Preconditions

- You are at the root of the target repository (the folder that contains `.git`).
- The kit is inside the workspace at `.sync-kit/` (cloned from a version tag, see the kit's `prompts/README.md`).
- You can run shell commands. If you cannot, print each command, ask the user to run it and paste the output back.

## Inputs

- The repository contents (read-only).
- The kit at `.sync-kit/` — the engine is `node .sync-kit/kit/scripts/sync.mjs`.
- `.sync-kit/docs/config.md` — meaning, defaults and validation of every config field, with contract glob examples.
- The user's answers to your questions.

## Steps

1. **Check the environment.** Run each command and stop at the first failure:
   - `node --version` — must be v18 or newer. Older or missing: tell the user to install Node.js 18+ and stop.
   - `node .sync-kit/kit/scripts/sync.mjs version` and read `.sync-kit/kit/scripts/VERSION` — both must work. If
     `.sync-kit/` is missing or unreadable, tell the user to place the kit inside this repository (see the kit's
     `prompts/README.md`, section "Setup") and stop.
   - The kit tag (e.g. `v1.0.0`), `<tag>` below. Only if `.sync-kit/.git` exists, run
     `git -C .sync-kit describe --tags`. Without `.sync-kit/.git` (tarball or archive install) do **not** run it: git
     would describe this repository instead of the kit. If `.sync-kit/.git` is missing or the command fails, propose
     `v` + the content of `VERSION` and ask the user to confirm.
   - `git check-ignore .sync-kit` — must print `.sync-kit`. If it prints nothing, ask the user for permission to append
     the line `.sync-kit/` to `.gitignore`, and append it only if they agree.
   - `git status --porcelain` — must be empty (ignore `.gitignore` if you just changed it, and `sync/.kit/` left by an earlier run of
     this phase). If not, show the list to the
     user and ask whether to continue anyway; stop if they say no.

2. **Look for an existing sync system.** If any of these exist, stop and tell the user to use
   `.sync-kit/prompts/extras/adopt-existing.md` instead of this phase: a `sync/` directory, or files/directories named
   like `CONTRACT*`, `CHANGELOG-API*`, `docs/api-changes*` (search the whole repo, ignoring `node_modules/`, `vendor/`,
   `.git/`, `.sync-kit/`). Exception: a `sync/` that contains only `.kit/` from an earlier run of this phase — continue.

3. **Survey the repository, read-only.** For every conclusion, record the evidence (repo-relative file paths, or the
   command and its output) and a confidence (`high` / `medium` / `low`). Investigate:
   1. **Topology.** Workspace files (`pnpm-workspace.yaml`, `package.json` `workspaces`, `nx.json`, `turbo.json`,
      `lerna.json`, `go.work`, `settings.gradle`, `Cargo.toml` `[workspace]`), several `package.json` / `go.mod` /
      `pyproject.toml` / `pom.xml` in separate app folders → `monorepo`. One codebase whose "sides" are roles (e.g.
      developers and QA/PO) → `single`. If the contract (API spec, schema) lives in **another** repository and this
      repository only consumes or publishes it, tell the user that this setup (`hub`) is planned for v1.1 and is not
      supported yet, then stop.
   2. **Sides.** App folders (`apps/*`, `services/*`, `backend/`, `frontend/`, `mobile/`, `web/`), `CODEOWNERS`, teams
      named in `README*` / `CONTRIBUTING*`. Propose short ids matching `^[a-z][a-z0-9-]*$` (e.g. `be`, `fe`, `mobile`,
      `qa`) with human labels. At least 2 sides are required. For `single`, typical sides are `dev` and `qa`.
   3. **Modules.** Business domains / services / packages (e.g. `src/modules/*`, Django apps, Go packages under
      `internal/`). Fewer than 4 clear modules → propose a flat layout (`modules: {}`).
   4. **Contract files**, per side: OpenAPI/Swagger files, `*.proto`, GraphQL schemas, controllers/routes/DTOs/
      serializers, ORM schema/migrations other sides depend on, public SDK types. Turn each into a concrete
      repo-relative glob (syntax and per-stack examples: `.sync-kit/docs/config.md`; no `{a,b}` braces). List the files
      each glob matches today as evidence.
   5. **CI.** `.github/workflows/` present → propose `github`. `.gitlab-ci.yml` present, or `git remote -v` points to a
      GitLab host → propose `gitlab`; also record whether `.gitlab-ci.yml` has a top-level `workflow:` block (and
      whether it mentions `merge_request_event`) and which jobs use `tags:` and with which values (runner tag
      candidates). No CI found → ask the user; if they choose `none`, tell them now that notifications need CI, so
      the channel will be `none` and only a local pre-commit hook is installed.
   6. **Chat channel.** Ask the user which one the team uses: Telegram, Google Chat, or none. Never ask for tokens,
      chat ids or webhook URLs — they are configured later as CI secrets.
   7. **Agent rule files.** Ask the user which coding agents the team uses, and propose only the files mapped to
      those agents in this table (repo root paths):

      | Agent | File that gets the sync-kit block |
      | --- | --- |
      | Claude Code | `CLAUDE.md` |
      | Codex and other agents that read `AGENTS.md` | `AGENTS.md` |
      | Cursor | `.cursor/rules/sync-kit.mdc` (always this new, dedicated file — never an existing `.mdc`) |
      | Gemini CLI | `GEMINI.md` |
      | GitHub Copilot | `.github/copilot-instructions.md` |

      Mark which of them already exist. Other rule files you find — `.cursorrules`, `.windsurfrules`, existing
      `.cursor/rules/*.mdc`, per-folder rule files such as `BACKEND_RULES.md` or `apps/web/AGENTS.md` — never get
      the block; list them in discovery only as candidates for a one-line pointer in phase 02.
   8. **Documentation language** — the dominant language of `README*` and `docs/`. `vi` if Vietnamese, otherwise `en`.
   9. **Backlog and reference format** — Jira/Linear/YouTrack links or keys in `README*`, a `tasks/` folder, GitHub/
      GitLab issues (`#123`). Record the id format notes will use in `refs` (e.g. `ABC-123`, `#123`, `PR-47`).
   10. **Team time zone**, only if you find it (docs, CI cron comments). Otherwise leave it out.

4. **Write `sync/.kit/discovery.md`** (create `sync/.kit/`; this is the only file you create in `sync/` yourself)
   with, in this order:
   - a table `Item | Proposed value | Evidence | Confidence` covering every item of step 3;
   - a complete draft of `sync/sync.config.json` in a fenced `json` code block: `kitVersion` (content of `VERSION`),
     `lang`, `topology`, `sides`, `paused` (`[]`), `modules`, `inbox` (`{ "commit": true }`), `contract.globs`,
     `strict` (`{ "enabled": true, "since": "<filled in phase 01>" }`), `notify` (`channel`, `managers: {}`,
     `remindMaxItems: 5`, `siteUrl: ""`);
   - the agent rule files to update (from the table of step 3.7) and the pointer candidates, the reference format for `refs`, the CI facts (workflow block, runner tag
     candidates), the time zone if known;
   - **at most 7 questions**, only for items with `low` confidence or that need a human decision.

5. **Ask the user** the questions and show the table. Apply their answers to `sync/.kit/discovery.md`. Only after the
   user explicitly confirms the proposal, record it with the engine (never write `state.json` yourself). Run from the
   repository root, replacing the values:
   ```
   node .sync-kit/kit/scripts/sync.mjs state init --kit-ref <tag> --sync-dir sync
   node .sync-kit/kit/scripts/sync.mjs state decide --topology <monorepo|single> --ci <github|gitlab|none> --channel <telegram|gchat|none> --lang <en|vi> --agent-file <path> --sync-dir sync
   node .sync-kit/kit/scripts/sync.mjs state phase 00 done --sync-dir sync
   ```
   - Repeat `--agent-file <path>` once per agent rule file (repo-relative, `/` separators, e.g.
     `--agent-file AGENTS.md --agent-file CLAUDE.md`). If the user wants no agent file, use `--no-agent-files` instead
     of `--agent-file`.
   - With `--ci none`, the channel must be `none`.
   - If a command exits non-zero, read its `error:` lines, fix the value with the user and rerun it.

## Hard rules

- Do not create or modify any file except `sync/.kit/discovery.md`, the files written by the `state` commands, and
  (with the user's consent) the `.sync-kit/` line in `.gitignore`.
- Do not install anything, run package managers, build, or start services.
- Do not propose a side, module or contract glob without evidence in the repository or an explicit user answer.
- Never write `sync/.kit/state.json` by hand; only through `sync.mjs state`.
- Never ask for or record secrets (bot tokens, chat ids, webhook URLs).
- Do not run `git commit`.

## Outputs

- `sync/.kit/discovery.md` — proposal table with evidence and confidence, draft config, open questions and answers.
- `sync/.kit/state.json` — written by `sync.mjs state`: `kitVersion`, `kitRef`, decisions, phase `00` done.
- Possibly one added line `.sync-kit/` in `.gitignore`.

## Verify

Run:

```
node .sync-kit/kit/scripts/sync.mjs doctor --phase 00 --sync-dir sync
```

Every line must start with `✓` and the exit code must be `0`. Fix any `✗` line before handing off.

## Handoff

Tell the user: phase 00 is done; the proposal is in `sync/.kit/discovery.md`. Next: open
`.sync-kit/prompts/01-install.md` and paste it into the agent. With a local agent a new session is fine — progress is
stored in `sync/.kit/state.json` and `sync/.kit/discovery.md` in the working tree, so nothing needs to be committed yet.
Cloud agents (Codex cloud, Claude Code web) start every task from the pushed branch: either continue with the next phase in this same task, or commit and push `sync/.kit/` (`state.json` and `discovery.md`) to the working branch before starting the next task.
