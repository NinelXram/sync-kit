<!-- sync-kit prompt: 05-rollout v1 -->
# Phase 05 — Rollout

You are installing sync-kit into this repository. Everything is installed; this phase puts it to use. It creates the
first real sync note (every side acknowledging it is the team's first exercise), writes a one-page onboarding guide
for the team, and sets up a two-week pilot with three measurable indicators.

## Goal

A first real note exists and is valid, `sync/ONBOARDING.md` explains the daily workflow in one page (in the config
language), `sync/.kit/pilot.md` holds a two-week pilot plan with three indicators, and the whole installation passes
`doctor`.

## Preconditions

- You are at the repository root.
- Phases 00 to 04 are each done or skipped: `node sync/scripts/sync.mjs state show` lists `"00"`, `"01"`, `"02"`,
  `"03"` and `"04"` under `phases`. If one is missing, stop and tell the user which prompt to run first
  (`.sync-kit/prompts/<NN>-*.md`).

## Inputs

- `sync/sync.config.json` — `lang`, `sides`, `paused`, `modules`, `contract.globs`, `notify.channel`.
- `node sync/scripts/sync.mjs state show` — `decisions.ci`, `decisions.agentFiles`.
- `sync/README.md` — the protocol and the project-rules block written in phase 01.
- The user's answers.

## Steps

1. **Ask the user**, in one message:
   - which side leads the adoption (it raises the first note) and the leader's handle (e.g. `@alice`);
   - which sides should acknowledge the note — suggest every side in `sides` that is not the leading side and not in
     `paused`;
   - with modules (`modules` is not `{}`): which module the note belongs to (suggest a shared or general one);
   - who to ask about the workflow (a name or handle for the guide), and the pilot's success targets if they have
     some (step 5 suggests defaults).

2. **Create the first note** (replace the values; omit `--module` when `modules` is `{}`; write the title in the
   config language):
   ```
   node sync/scripts/sync.mjs new --module <module> --from <lead side> --to <side1,side2> --type question --slug adopt-sync-kit --title "sync-kit is installed: please confirm you have read the protocol" --author "@alice"
   ```
   It prints the path of the new note. If it prints `error:` lines, fix the values and rerun. Then edit only the body
   of that note (never its frontmatter), in the config language:
   - **Summary:** sync notes are now how sides tell each other about changes that affect them; this note is the first
     exercise.
   - **Details:** the question — "Has your side read `sync/ONBOARDING.md` and `sync/README.md`? Is anything unclear?"
   - **Contract (before → after):** delete this section (no contract changes).
   - **What the receiving side must do:** one checklist line per receiving side: read `sync/ONBOARDING.md`, set its
     `targets` entry to `acked`, append an entry at the end of the Discussion section in the form
     `### [<SIDE LABEL>] <YYYY-MM-DD> <@handle> — acked` with one line of text (questions welcome), run
     `node sync/scripts/sync.mjs inbox`, and open a pull/merge request with the change. When the side has no open
     question left, it sets `applied` the same way, with an entry that names that pull/merge request.
   - **How to verify:** `node sync/scripts/sync.mjs check` passes; the note is closed (it leaves `sync/INBOX.md`)
     once every receiving side is `applied`.
   - Keep the **Discussion** section and its comment unchanged; do not add entries for other sides.

3. **Write `sync/ONBOARDING.md`** — one page (at most about 60 lines), in the config language (`lang`: `en` →
   English, `vi` → Vietnamese), using the project's real values. Sections:
   - **What this is** — two sentences: sync notes under `sync/` carry every change or problem that affects another
     side; `sync/README.md` is the full protocol.
   - **Sides and modules** — the sides (id and label) and, if any, the modules with their folders.
   - **Your daily loop** — before a task, read `sync/INBOX.md` (your side's section); when a note targets your side,
     change your `targets` status and append a Discussion entry; when you change a contract file (list the
     `contract.globs` per side), create a note; after any change under `sync/`, run `inbox` and commit the note with
     the pull/merge request of the change.
   - **Commands** — copy-runnable, with a real side and module of this project:
     `node sync/scripts/sync.mjs new …` (full example as in the project-rules block of `sync/README.md`),
     `node sync/scripts/sync.mjs inbox`, `node sync/scripts/sync.mjs check`.
   - **Statuses** — `pending`, `acked`, `applied` (give the PR/commit), `disputed` (give the reason), `n/a` (give the
     reason), one line each.
   - **Notifications** — where messages appear (the channel, and that reminders run on a schedule), or that there are
     none when `notify.channel` is `none`.
   - **Coding agents** — the agent rule files from `decisions.agentFiles` already tell agents to follow the protocol.
   - **Your first exercise** — acknowledge the note created in step 2 (give its id).
   - **Questions** — who to ask (from step 1).

   No secrets, no tokens, no webhook URLs.

4. **Link the guide.** Add one line inside the project-rules block of `sync/README.md` (between
   `<!-- sync-kit:project-rules:start -->` and `<!-- sync-kit:project-rules:end -->`, in the config language) that
   points new team members to [ONBOARDING.md](ONBOARDING.md). Change nothing else in `sync/README.md`.

5. **Write the pilot plan `sync/.kit/pilot.md`** in the config language. Get the start date with
   `node sync/scripts/sync.mjs state today` (never guess it); the end date is 14 days later. Include:
   - the period, the leading side and handle, and check-in dates at day 7 and day 14;
   - **Indicator 1 — notes opened and closed** during the pilot. How to measure: the line `Open: … · Closed: …` at the
     top of `sync/INBOX.md`, plus the count of note files whose `created` date is inside the period. Suggested target:
     at least one note per side that changes contracts, and more notes closed than opened in week 2.
   - **Indicator 2 — days from `pending` to `acked`.** How to measure: for each note and receiving side, the date of
     that side's first Discussion entry minus the note's `created` date; report the median. Suggested target: median
     of 2 working days or less.
   - **Indicator 3 — pull/merge requests that changed contract files without a note.** How to measure:
     - `github`: in the `sync-check` runs of the pull requests merged in the period, count the `Contract check` steps
       that printed the contract warning (`… contract file(s) changed but no sync note was added or changed in this
       range`, or the same message in the config language);
     - `gitlab`: the same warning in the `sync-check` job logs of the merge requests;
     - `none`: for each merge commit `<sha>` of the period, run
       `node sync/scripts/sync.mjs contract-check --base <sha>~1 --head <sha>` and count the warnings.
     Suggested target: 0 in week 2.
   - the decision at day 14: keep as is, adjust (contract globs, reminder time, managers) with the `extras/` prompts,
     or stop (`.sync-kit/prompts/extras/uninstall.md`).

   Replace the suggested targets with the user's targets if they gave some in step 1.

6. **Regenerate and check:**
   ```
   node sync/scripts/sync.mjs inbox
   node sync/scripts/sync.mjs check
   ```
   `check` must exit `0`.

7. **Dry run of the announcement** (only when `notify.channel` is not `none`): after the user has committed the note,
   `node sync/scripts/sync.mjs notify --before HEAD~1 --after HEAD --dry-run` prints the message CI will post when the
   note reaches the default branch. Never run `notify` or `remind` without `--dry-run` here.

## Hard rules

- Create the note only with `sync.mjs new`; never write its frontmatter by hand and never add Discussion entries for
  other sides.
- Write `sync/ONBOARDING.md`, `sync/.kit/pilot.md` and the body of the first note in the config language.
- In `sync/README.md`, add only the one line of step 4 inside the project-rules markers.
- Never write `sync/.kit/state.json` by hand; only through `sync.mjs state`. Take dates only from
  `sync.mjs state today`.
- No secrets in any file or message.
- Do not run `git commit`; only suggest it.

## Outputs

- The first note, e.g. `sync/notes/<YYYY-MM-DD>-<side>-adopt-sync-kit.md` (or in the chosen module's folder).
- `sync/ONBOARDING.md` — the one-page guide.
- `sync/.kit/pilot.md` — the two-week pilot plan with three indicators.
- One link line in the project-rules block of `sync/README.md`; regenerated `sync/INBOX*.md`.

## Verify

```
node sync/scripts/sync.mjs doctor --phase 05
```

This runs the checks of every phase. The exit code must be `0` and no line may start with `✗`; `!` warnings accepted
in earlier phases are fine. It must include `✓ at least one sync note exists (…)` (or the same text in the config
language).

## Handoff

Record the phase and run the full check once more:

```
node sync/scripts/sync.mjs state phase 05 done
node sync/scripts/sync.mjs doctor
```

Tell the user:

- commit the note, `sync/ONBOARDING.md`, `sync/.kit/pilot.md`, `sync/README.md` and the INBOX files, e.g.
  `docs(sync): first sync note and onboarding`, in a small pull/merge request merged early, so the announcement
  reaches the channel;
- share `sync/ONBOARDING.md` with every side and ask each side to acknowledge the note through its own pull/merge
  request;
- at day 7 and day 14, ask an agent to read `sync/.kit/pilot.md` and compute the three indicators.

The installation is complete. For later changes use the prompts in `.sync-kit/prompts/extras/`.
