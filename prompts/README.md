# sync-kit prompts

Phased prompts that let an AI agent install the sync-note workflow into an existing repository. Each phase is one prompt file; paste it into the agent, let it finish, and check the gate before moving on.

## Setup

Run these at the root of the **target** repository:

```
git clone -b v1.0.0 --depth 1 https://github.com/NinelXram/sync-kit.git .sync-kit
```

Alternatively download the tarball of the `v1.0.0` tag and extract it into `.sync-kit/`. Then add `.sync-kit/` to the target repo's `.gitignore`.

The kit always lives inside the workspace: sandboxed agents (Codex cloud, Claude Code web, Cursor) usually cannot read folders outside the repo. Never use an unpinned `main`; always fetch a tag.

Open your agent at the target repo root and paste one phase prompt at a time. Progress is recorded in files in the repository (`sync/.kit/state.json`, `sync/.kit/discovery.md`, ...), not in the chat:

- **Local agents** (CLI or IDE on your machine) may use a fresh session per phase: the files are still in the working tree.
- **Cloud agents** (Codex cloud, Claude Code web) start each task from the pushed branch, so uncommitted files from an earlier task are gone. Either run all phases in one task, or commit and push each phase's output — including `sync/.kit/` — to the working branch before starting the next task.

Before install, prompts call the engine as `node .sync-kit/kit/scripts/sync.mjs ...`; after install, as `node sync/scripts/sync.mjs ...`. These fixed paths work the same on bash, PowerShell and cmd.

## Phases

```
00-discover -> 01-install -> 02-agent-rules -> 03-ci -> 04-notify -> 05-rollout
```

| Phase | Prompt | Gate |
| --- | --- | --- |
| 00 | `00-discover.md` | `doctor --phase 00` |
| 01 | `01-install.md` | `doctor --phase 01` |
| 02 | `02-agent-rules.md` | `doctor --phase 02` |
| 03 | `03-ci.md` | `doctor --phase 03` |
| 04 | `04-notify.md` | `doctor --phase 04` |
| 05 | `05-rollout.md` | `doctor --phase 05` |

Run the gate as `node sync/scripts/sync.mjs doctor --phase NN` (phase 00 uses `node .sync-kit/kit/scripts/sync.mjs doctor --phase 00`, after the state is written).

## Extras

| Prompt | Use when |
| --- | --- |
| `extras/upgrade.md` | moving to a newer kit tag |
| `extras/add-side.md` | adding a side (team/app) |
| `extras/add-module.md` | adding a module |
| `extras/pause-side.md` | pausing or resuming a side |
| `extras/adopt-existing.md` | the repo already has hand-made sync notes |
| `extras/uninstall.md` | removing the workflow |

## Prompt standard

Every prompt:

1. Line 1 is `<!-- sync-kit prompt: <id> v1 -->`, where `<id>` is the file name without `.md`.
2. Has these H2 sections, in this order: `Goal`, `Preconditions`, `Inputs`, `Steps`, `Hard rules`, `Outputs`, `Verify`, `Handoff`.
3. `Verify` contains a `sync.mjs doctor` command.
4. Contains no `@main` or `/main/` reference.
5. Never copies `kit/scripts` with `cp` or `Copy-Item`: the engine is installed only through `sync.mjs install`.
6. Never uses a `KIT` shell variable: every command uses the fixed path `.sync-kit/kit/...`.

Check with `npm run lint:prompts` (exit 1 on any error).

## Codex cloud

Each task starts from the pushed branch: run all phases in one task, or commit and push each phase's output (including `sync/.kit/`) before the next task (see above).

Network access is usually off while the agent runs. Clone `.sync-kit` in the environment **setup script** (where network is on), not as an agent step:

```
git clone -b v1.0.0 --depth 1 https://github.com/NinelXram/sync-kit.git .sync-kit
```

## If the agent cannot run commands

Run the command yourself in a terminal at the repo root and paste the output back to the agent, or ask the agent to print the exact command and wait. If the agent cannot read `.sync-kit/`, confirm the folder exists inside the workspace (not a parent directory) and is not excluded by the agent's ignore settings. Never paste secrets into the chat: tokens and webhook URLs go only in environment variables.
