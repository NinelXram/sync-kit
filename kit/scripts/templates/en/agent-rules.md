## Sync notes protocol (sync-kit)

This project keeps cross-side changes in sync notes under `sync/`. Sides: {{sides}}. Full protocol: `sync/README.md`.

1. Before starting a task, read `sync/INBOX.md` and look for notes that involve the sides your task touches.
2. If a note concerns your work, update its `targets` and add your entry to its Discussion section. Do not edit sections that belong to other sides.
3. When you change files that match the contract globs below, create a note with `node sync/scripts/sync.mjs new` (usage: `sync/README.md`) so the other sides learn about it.
4. After editing anything under `sync/`, run `node sync/scripts/sync.mjs inbox` and commit the regenerated inbox if it is tracked.
5. Tell the user about every note with priority `blocker` or `high` that is waiting on a side.
6. In your final report, list the sync notes you created or changed.

Contract globs (changes here need a sync note):

{{contract}}
