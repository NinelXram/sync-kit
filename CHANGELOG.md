# Changelog

## [1.0.0] - Unreleased

Tagging `v1.0.0` waits for the pending field tests in [docs/field-tests.md](docs/field-tests.md#field-tests--pending)
(≥ 2 real repositories × ≥ 2 agents, including a self-hosted GitLab sending to a real Google Chat Space).

### Engine (`kit/scripts/`, Node ≥ 18, zero dependencies)

- Commands: `install`, `state`, `init`, `new`, `inbox`, `check`, `contract-check`, `notify`, `remind`,
  `agent-rules`, `doctor`, `version`.
- `install` copies the engine into `sync/scripts/`; `doctor` verifies every file against `MANIFEST.json` (sha256,
  line-ending independent) and checks each phase deterministically.
- One project file, `sync/sync.config.json` (sides, paused sides, modules, INBOX commit, contract globs, strict
  checks, notifications); installation state in `sync/.kit/state.json`, written only by `sync.mjs state`.
- Strict Discussion checks for notes created on or after `strict.since`; unknown entry statuses only warn.
- Generated files in English or Vietnamese (`lang`).

### CI templates (`kit/ci/`)

- GitHub Actions: `sync-check`, `sync-notify`, `sync-reminder`.
- GitLab CI (incl. self-hosted, GitLab ≥ 13.7): `sync-check.gitlab-ci.yml`, `sync-notify.gitlab-ci.yml` (notify +
  scheduled remind), attached with one `include: local` line.
- No CI: `pre-commit` hook.

### Prompts (`prompts/`)

- Phases `00-discover`, `01-install`, `02-agent-rules`, `03-ci`, `04-notify`, `05-rollout`.
- Extras: `upgrade`, `add-side`, `add-module`, `pause-side`, `adopt-existing`, `uninstall`.
- Prompt standard enforced by `npm run lint:prompts`.

### Notification channels

- Telegram (with per-side manager mentions).
- Google Chat Space incoming webhook (one thread per note; reminders as new messages).
- `none`.

### Documentation

- `README.md`, `README.vi.md`, `docs/protocol.md`, `docs/config.md`, `docs/state.md`, `docs/design-decisions.md`,
  `docs/field-tests.md`.
