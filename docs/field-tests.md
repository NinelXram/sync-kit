# Field tests

Runs of the prompts on real repositories, before a release. Each entry is anonymous: no project, company, module or
person names.

## Field tests — pending

Not run yet. The `v1.0.0` tag waits for these runs. Before tagging, run prompts `00-discover` → `05-rollout` on at
least **2 real repositories × 2 different agents** (suggested: Claude Code and Codex; one Node monorepo, one Python
repository). At least **one repository must be on a self-hosted GitLab** and send to a **real Google Chat Space**
(`notify.channel: "gchat"`).

### Observations to confirm by hand (self-hosted GitLab + Google Chat run)

- [ ] A merge request that touches `sync/**` runs the `sync-check` job.
- [ ] MR gating: on a project without `workflow:` rules, check whether the merge request shows a separate pipeline
      with only `sync-check` and which pipeline "Pipelines must succeed" follows; then repeat with the standard
      `workflow: rules` block from prompt 03 (step 3.4) and confirm one merge request pipeline runs all jobs.
- [ ] Pushing a new note to the default branch posts a message into the Space.
- [ ] Editing that note (`disputed`, then `applied`) posts into the **same thread** as the first message.
- [ ] A pipeline schedule with `SYNC_REMIND=1` posts the reminder as a **new** message (not in a note thread).
- [ ] A note title containing `<`, `*` and `_` renders literally (no broken formatting, no swallowed characters).
- [ ] The note link in the message opens the right file on the self-hosted GitLab (including a sub-path / custom
      port, if the instance has one).

### What to record per run

Repository (anonymous description), hosting + CI, agent / model, phases run, number of questions the agent asked,
where the agent deviated from the prompt, `doctor` result. A defect found → fix the prompt (or engine), then re-run
that phase.

### Results

| # | Repository (anonymous) | Hosting / CI | Channel | Agent / model | Phases | Questions | Deviations | `doctor` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | 00–05 | | | |
| 2 | | | | | 00–05 | | | |

| Observation | Run | Result |
| --- | --- | --- |
| MR runs `sync-check` | | |
| MR gating (separate MR pipeline / `workflow: rules`) | | |
| push → message in Space | | |
| edit → same thread | | |
| schedule → new message | | |
| `<`, `*`, `_` in title render correctly | | |
| link opens on self-hosted GitLab | | |
