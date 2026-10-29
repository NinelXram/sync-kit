# Configuration (`sync/sync.config.json`)

`sync/sync.config.json` describes the project to the engine: which sides exist, where notes live, which files are
contracts, how strict the checks are and where notifications go. Phase 01 (`prompts/01-install.md`) writes it from the
decisions of phase 00; edit it by hand afterwards when the project changes (or use the `extras/` prompts).

Complete, valid examples: [`examples/monorepo.config.json`](../examples/monorepo.config.json) and
[`examples/single.config.json`](../examples/single.config.json).

## How the file is read

- The file is JSON (no comments). A UTF-8 BOM and Windows line endings (`\r\n`) are accepted.
- Your values are **deep-merged over the defaults** below: any object you omit (or any key you omit inside an object)
  takes its default. Arrays and scalars replace the default as a whole.
- The merged result is validated. Every command except `version`, `install`, `state` and `doctor` refuses to run on an
  invalid config: it prints one `error:` line per problem and exits `1`. `doctor` reports an invalid config as the
  failed check `sync/sync.config.json is valid`.
- Unknown keys are ignored.

## Fields

| Field | Type | Default | Validation |
| --- | --- | --- | --- |
| `kitVersion` | string | — (**required**) | non-empty string; must equal `sync/scripts/VERSION` and the state's `kitVersion` (checked by `doctor --phase 01`) |
| `lang` | `"en"` \| `"vi"` | `"en"` | one of the two values |
| `topology` | `"monorepo"` \| `"single"` | `"monorepo"` | `"hub"` is rejected (planned for v1.1) |
| `sides` | object id → label | — (**required**) | at least 2 sides; id matches `^[a-z][a-z0-9-]*$`; label is a non-empty string |
| `paused` | string[] | `[]` | every entry is a key of `sides` |
| `modules` | object name → dir | `{}` | every dir is a non-empty string; no two modules share a dir |
| `inbox.commit` | boolean | `true` | boolean |
| `contract.globs` | object side → string[] | `{}` | every key is a key of `sides`; every value is an array of strings |
| `strict.enabled` | boolean | `true` | boolean |
| `strict.since` | `"YYYY-MM-DD"` | — (**required**) | matches `^\d{4}-\d{2}-\d{2}$` |
| `notify.channel` | `"telegram"` \| `"gchat"` \| `"none"` | `"none"` | `"slack"` / `"discord"` are rejected (planned for v1.1) |
| `notify.managers` | object side → string[] | `{}` | every key is a key of `sides`; every value is an array of strings |
| `notify.remindMaxItems` | integer | `5` | integer ≥ 1 |
| `notify.siteUrl` | string | `""` | empty, or starts with `http://` / `https://` |

### `kitVersion`

The engine version this config was written for (`"1.0.0"` for kit tag `v1.0.0`). It is not a default on purpose:
after an upgrade, `doctor` flags a config that still names the old version.

### `lang`

Language of everything the engine generates inside the project: `sync/README.md`, `_TEMPLATE.md`, the INBOX files,
the agent-rules block and the chat messages. Prompts themselves are always English.

### `topology`

- `monorepo` — one repository holds the code of several sides (for example `be`, `fe`, `mobile`).
- `single` — one codebase; the sides are roles around it (for example `dev` and `qa`).

Contracts kept in a separate repository (`hub`) are not supported in v1.

### `sides`

Map of side id → human label, e.g. `{ "be": "Backend", "fe": "Web" }`. The id appears in note ids
(`2026-10-29-be-add-refunds`), in `from` / `targets` and in commands (`--from be --to fe`). The label is shown in INBOX
and messages. In a note's Discussion section an entry label matches a side by id **or** label, case-insensitively, so
`### [QA] …` belongs to side `qa`.

### `paused`

Sides that are temporarily not being worked on. Notes keep their `targets` entry for a paused side, but `INBOX.md` only
shows a count and a pointer to `INBOX-<SIDE>.md`, and reminders skip the side. Remove the id to resume, then run
`node sync/scripts/sync.mjs inbox`.

### `modules`

Map of module name → note directory (relative to `sync/`), e.g. `{ "billing": "billing", "orders": "orders" }`.
`new --module billing` writes into `sync/billing/`. An empty object means a **flat layout**: every note goes into
`sync/notes/` and its `module` is `general`. Prefer flat for fewer than 4 modules.

### `inbox.commit`

- `true` — `INBOX.md` / `INBOX-<SIDE>.md` are committed, and `check` fails when they are out of date (run
  `node sync/scripts/sync.mjs inbox` and commit).
- `false` — `init` adds `sync/INBOX*.md` to the repository `.gitignore`; each developer regenerates the inbox locally,
  and `check` does not compare it.

### `contract.globs`

Per side, the files that form that side's contract with the others. When a pull request changes a matching file
without adding or changing a note, `contract-check` prints a warning (an error only with `--strict`). The globs are
also listed in the agent-rules block so coding agents know when a note is required.

Glob syntax (paths are repo-relative, with `/`):

| Pattern | Matches |
| --- | --- |
| `*` | any characters except `/` |
| `?` | one character except `/` |
| `**/` | zero or more directories |
| `**` | anything, including `/` |

Brace (`{a,b}`) and class (`[ab]`) patterns are **not** supported — write one glob per alternative.

### `strict.enabled`, `strict.since`

With `strict.enabled`, notes whose `created` date is on or after `strict.since` must keep their Discussion section
consistent with `targets`: every non-`pending` target needs a matching last entry of that side, `applied` needs a
reference (PR, commit, URL or ticket id), `disputed` and `n/a` need a reason. Entries with a status outside the
standard ones (e.g. `raised`) only produce a warning. Notes created before `strict.since` are never checked strictly,
so notes that existed before the kit was installed keep passing.

Set `strict.since` to the installation day, as printed by `node sync/scripts/sync.mjs state today` (the machine's local
date). Never compute it from UTC.

### `notify.channel`

Where `notify` (new / disputed / closed notes, on push to the default branch) and `remind` (scheduled digest) post:

- `telegram` — needs the environment variables `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
- `gchat` — a Google Chat Space incoming webhook, environment variable `GCHAT_WEBHOOK_URL`. Webhooks cannot mention
  people, so `managers` is ignored.
- `none` — nothing is sent. Required when the project has no CI.

Secrets are only ever read from environment variables (CI secrets / CI/CD variables). Never put them in this file.

### `notify.managers`

Per side, the handles to mention in Telegram messages about that side, e.g. `{ "be": ["@alice"] }`. With
`channel: "telegram"`, `doctor --phase 04` requires at least one handle for every side that is not paused.

### `notify.remindMaxItems`

Maximum number of notes listed per side in one reminder (most urgent first).

### `notify.siteUrl`

Optional link added as one line at the end of each reminder (e.g. a page that renders the notes). `""` = no link.

## Contract glob examples by stack

Adjust the directory prefix (`apps/api/`, `src/`, …) to the project. Pick the files another side actually consumes:
API descriptions, routes/controllers, request/response types, database schema that others read, public SDK types.

| Stack | Example globs |
| --- | --- |
| NestJS | `apps/api/src/**/*.controller.ts`, `apps/api/src/**/*.dto.ts`, `apps/api/prisma/schema.prisma` |
| Express | `server/routes/**/*.js`, `server/routes/**/*.ts`, `server/validators/**/*.ts` |
| Django / DRF | `**/urls.py`, `**/serializers.py`, `**/migrations/*.py` |
| FastAPI | `app/api/**/*.py`, `app/routers/**/*.py`, `app/schemas/**/*.py`, `alembic/versions/*.py` |
| Rails | `config/routes.rb`, `app/controllers/api/**/*.rb`, `app/serializers/**/*.rb`, `db/schema.rb` |
| Spring | `src/main/java/**/controller/**/*.java`, `src/main/java/**/dto/**/*.java`, `src/main/resources/db/migration/*.sql` |
| Go | `api/**/*.go`, `internal/handler/**/*.go`, `migrations/*.sql` |
| gRPC | `proto/**/*.proto` |
| GraphQL | `**/*.graphql`, `**/schema.gql` |
| OpenAPI / Swagger | `openapi.yaml`, `**/openapi*.json`, `**/swagger*.yaml` |
| Public SDK / shared types | `packages/sdk/src/index.ts`, `packages/types/src/**/*.ts` |

## Self-hosted runner without internet access

`notify` and `remind` call `api.telegram.org` (Telegram) or `chat.googleapis.com` (Google Chat) with Node's built-in
`fetch`. On a network error they print the channel name and a proxy hint (never the webhook URL) and exit `1`.

- **Recent Node 22 / 24 releases** (the kit's CI templates use the `node:22` image): set
  `NODE_USE_ENV_PROXY=1` together with `HTTPS_PROXY` (and `NO_PROXY` if needed) in the job's environment; `fetch`
  then goes through the proxy. Support arrived in the 24.x line and was backported to late 22.x releases — check the
  Node docs for your exact version (`node -v` on the runner) before relying on it.
- **Older Node:** `fetch` ignores proxy variables. The runner itself needs an outbound route to
  `api.telegram.org` / `chat.googleapis.com` (or use a newer Node image).

Only the notification jobs need the network; `check` and `contract-check` run fully offline.

## GitLab: merge request pipelines

The kit's `sync-check` job runs only in merge request pipelines (`$CI_PIPELINE_SOURCE == "merge_request_event"`). If
`.gitlab-ci.yml` has no `workflow:` rules and the project's jobs run in branch pipelines, GitLab then creates a
**separate merge request pipeline** containing only `sync-check`, next to the branch pipeline with the tests. With
"Pipelines must succeed" enabled, the merge request may follow that small pipeline instead of the tests.

GitLab's standard pattern switches between branch and merge request pipelines, so a branch with an open merge request
runs one merge request pipeline with all jobs:

```yaml
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH && $CI_OPEN_MERGE_REQUESTS
      when: never
    - if: $CI_COMMIT_BRANCH
```

Jobs with their own `rules:` / `only:` that exclude merge request pipelines need checking before adding it. Prompt
`03-ci` explains this and leaves the decision to you; the kit never edits `workflow:` without your consent.
