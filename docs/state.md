# Installation state (`sync/.kit/state.json`)

sync-kit records how far the installation got and which choices were made in `sync/.kit/state.json`.
Prompts read it to resume where the previous agent stopped; `sync.mjs doctor` reads it to know which phases to verify.

**Only write this file through `sync.mjs state`.** Never edit it by hand or let an agent write it directly:
every `state` command validates the whole file before writing and writes nothing when the input is invalid
(exit code `1`; wrong usage exits `2`).

## Schema

```ts
type State = {
  kitVersion: string;            // engine version that ran `state init` (kit/scripts/VERSION), e.g. "1.0.0"
  kitRef: string;                // git ref of the kit that was installed, e.g. "v1.0.0"
  phases: Record<'00'|'01'|'02'|'03'|'04'|'05', { status: 'done' | 'skipped'; at: string /* YYYY-MM-DD, local date */ }>;
  decisions: {                   // filled step by step; every key is optional until decided
    topology: 'monorepo' | 'single';            // 'hub' → v1.1
    ci: 'github' | 'gitlab' | 'none';
    agentFiles: string[];                       // repo-relative, e.g. ["CLAUDE.md", "AGENTS.md"]
    channel: 'telegram' | 'gchat' | 'none';     // 'slack' | 'discord' → v1.1
    lang: 'en' | 'vi';
  };
};
```

Rules enforced by validation:

- `ci: "none"` requires `channel: "none"` — notifications require CI.
- `slack` / `discord` channels and the `hub` topology are rejected with a message pointing to v1.1.
- Phase keys are `00`…`05`; status is `done` or `skipped`; `at` is the machine's local date.

The file is written as 2-space JSON with a trailing newline and a fixed key order, so running the same command
twice produces a byte-identical file.

## Example

```json
{
  "kitVersion": "1.0.0",
  "kitRef": "v1.0.0",
  "phases": {
    "00": { "status": "done", "at": "2026-10-29" },
    "01": { "status": "done", "at": "2026-10-29" },
    "02": { "status": "skipped", "at": "2026-10-29" }
  },
  "decisions": {
    "topology": "monorepo",
    "ci": "gitlab",
    "agentFiles": ["CLAUDE.md", "AGENTS.md"],
    "channel": "gchat",
    "lang": "en"
  }
}
```

(Real files are expanded by `JSON.stringify(…, null, 2)`, one key per line.)

## Commands

Before the engine is installed into the project, run the kit copy with `--sync-dir sync`;
afterwards use `node sync/scripts/sync.mjs …`.

| Command | Effect |
| --- | --- |
| `state init --kit-ref <tag>` | Create the file (or refresh `kitVersion`/`kitRef`, keeping phases and decisions). |
| `state decide [--topology …] [--ci …] [--agent-file <path> … | --no-agent-files] [--channel …] [--lang …]` | Merge the given decisions. `--agent-file` may repeat; the given list replaces the previous one. `--no-agent-files` records an empty list (no agent rule file; phase 02 then has to be `skipped`); it cannot be combined with `--agent-file` (usage error, exit `2`). |
| `state phase <NN> done\|skipped` | Mark a phase, `at` = today's local date. Requires `state init` first. |
| `state show` | Print the file. |
| `state today` | Print today's local date (`YYYY-MM-DD`) — use it for `strict.since`. |

Examples:

```sh
node .sync-kit/kit/scripts/sync.mjs state init --kit-ref v1.0.0 --sync-dir sync
node .sync-kit/kit/scripts/sync.mjs state decide --topology monorepo --ci github --agent-file CLAUDE.md --channel telegram --lang en --sync-dir sync
node sync/scripts/sync.mjs state phase 01 done
```

## How `doctor` uses it

`node sync/scripts/sync.mjs doctor [--phase NN] [--json]`

- `--phase NN` runs the checks of every phase from `00` up to `NN`, whatever their recorded status.
- Without `--phase`, it runs phase `00` plus every phase present in `phases` (`done` or `skipped`).
- A `skipped` phase is still checked and must pass in its "off" configuration: e.g. a skipped `04` means
  `channel: "none"` in both state and config; a skipped `02` allows an empty `agentFiles`.
  Skipping a phase never bypasses the engine-integrity checks of phase `01`.
- Decisions (`ci`, `agentFiles`, `channel`) decide which CI, hook and notification files are checked.
- `kitVersion` must equal `sync/scripts/VERSION` and `config.kitVersion`.
