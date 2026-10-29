# sync-kit

*English · [Tiếng Việt](README.vi.md)*

A zero-dependency Node engine plus phased prompts that let any AI coding agent (Claude Code, Codex, Cursor, Gemini,
Copilot, …) install a **sync note** workflow into an existing repository.

## The problem

When several sides work on one product — backend, web, mobile, QA — most breakage happens *between* them: an endpoint
changes shape, an enum gains a value, a bug is found in someone else's work. Chat messages get lost, tickets live in
each team's own backlog, and nobody can answer "what is still waiting on my side?".

A **sync note** is one markdown file in the repository that announces one change or problem that affects other sides.
Every receiving side has its own status inside the note, and appends a short entry to the note's Discussion section
each time that status changes. The engine generates an INBOX per side, checks the notes in CI, posts to a chat channel
when something happens and sends scheduled reminders.

```
pending ──► acked ──► applied
   │          │
   └──► disputed ◄──┘      (pushback → raising side replies → receiver moves to acked / applied / n/a)
   └──► n/a                (does not affect this side — give the reason)
```

A note is closed when every receiving side is `applied` or `n/a`. Full rules: [docs/protocol.md](docs/protocol.md).

## Quick start

At the root of the target repository (Node ≥ 18 and git required):

```
git clone -b v1.0.0 --depth 1 https://github.com/NinelXram/sync-kit.git .sync-kit
```

Add `.sync-kit/` to the repository's `.gitignore`. Then open your agent at the repository root and paste the
contents of `.sync-kit/prompts/00-discover.md`. When the phase gate passes, continue with the next prompt. Details (tarball install, Codex cloud, agents that cannot run
commands): [prompts/README.md](prompts/README.md).

## Phases

| Phase | Prompt | What happens | Gate |
| --- | --- | --- | --- |
| 00 | `prompts/00-discover.md` | read-only survey; proposes sides, modules, contract globs, CI and channel; you approve | `doctor --phase 00` |
| 01 | `prompts/01-install.md` | `sync.mjs install` copies the engine into `sync/scripts/`, writes `sync/sync.config.json`, runs `init`, writes the project rules | `doctor --phase 01` (incl. engine hashes) |
| 02 | `prompts/02-agent-rules.md` | adds a marked rules block to the agent files you use (`CLAUDE.md`, `AGENTS.md`, …) | `doctor --phase 02` |
| 03 | `prompts/03-ci.md` | GitHub Actions, GitLab CI (incl. self-hosted) or a pre-commit hook | `doctor --phase 03` |
| 04 | `prompts/04-notify.md` | Telegram, Google Chat or none; dry-run | `doctor --phase 04` |
| 05 | `prompts/05-rollout.md` | first real note, one-page team guide, pilot plan | `doctor` |

Extras in `prompts/extras/`: `upgrade`, `add-side`, `add-module`, `pause-side`, `adopt-existing` (the repository
already has hand-made notes), `uninstall`.

Every phase ends with a deterministic check (`node sync/scripts/sync.mjs doctor --phase NN`), not with the agent
deciding it looks fine. Progress is recorded in `sync/.kit/state.json`, so with a local agent each phase can run in a fresh session; cloud
agents (Codex cloud, Claude Code web) must run all phases in one task or commit and push each phase's output
(including `sync/.kit/`) before the next task.

## What gets installed

- `sync/scripts/` — the engine: `install`, `state`, `init`, `new`, `inbox`, `check`, `contract-check`, `notify`,
  `remind`, `agent-rules`, `doctor`, `version`. Installed only by `sync.mjs install` and verified by sha256
  against `MANIFEST.json`; agents never rewrite it.
- `sync/sync.config.json` — the only project-specific file ([docs/config.md](docs/config.md)).
- `sync/README.md` (the protocol for your team), `sync/_TEMPLATE.md`, `sync/INBOX.md`, note folders.
- CI jobs / hook from `kit/ci/`, and a rules block in your agent files.

Generated files are in English or Vietnamese (`lang` in the config). Prompts are always English.

## Requirements

- Node.js ≥ 18 (locally and on the CI runner). No npm dependencies.
- git.
- For CI: GitHub Actions, or GitLab ≥ 13.7 (gitlab.com or self-hosted). Without CI, a pre-commit hook is used and
  notifications are off.

## FAQ

**Why files in git instead of an issue tracker?** The note travels with the code change in the same pull request, is
reviewed with it, and CI can check it. Every side, and every coding agent, can read it offline without access to
another team's tracker. Notes point to tickets through `refs`; they do not replace anyone's backlog.

**Several repositories?** v1 supports one repository holding several sides (`monorepo`) or one codebase with roles
around it such as dev and QA (`single`). Contracts kept in a separate hub repository are planned for v1.1.

**How do I turn notifications off?** Set `"channel": "none"` under `notify` in `sync/sync.config.json` and record it
with `node sync/scripts/sync.mjs state decide --channel none`. The CI jobs keep running but send nothing (with
`none`, messages are only printed in the job log). To mute one side temporarily, add it to `paused`
(`prompts/extras/pause-side.md`).

**Old notes fail the new checks?** No. Strict checks only apply to notes created on or after `strict.since` (the
installation day). See [docs/protocol.md](docs/protocol.md#strict-checks).

## Documentation

- [docs/protocol.md](docs/protocol.md) — the note protocol (language-independent)
- [docs/config.md](docs/config.md) — `sync/sync.config.json`
- [docs/state.md](docs/state.md) — `sync/.kit/state.json` and `doctor`
- [docs/design-decisions.md](docs/design-decisions.md) — why the kit is built this way
- [docs/field-tests.md](docs/field-tests.md) — runs on real repositories
- [prompts/README.md](prompts/README.md) — using the prompts
- [CHANGELOG.md](CHANGELOG.md)

## Developing the kit

```
npm test
npm run e2e
npm run lint:prompts
```

After any change under `kit/scripts/`, run `node scripts/build-manifest.mjs`.

## License

MIT — see [LICENSE](LICENSE).
