# Cards Under Glass

Read `docs/PRODUCT_SPEC.md` and `docs/ARCHITECTURE.md` before changing behavior. This is a personal, local-first desktop hobby app. Implement only the requested milestone; do not advance future inspection, photos, export or archive work without a request.

- Electron main owns SQLite and filesystem access. Keep renderer Node integration off, context isolation and sandbox on. Expose narrow typed preload operations, validate IPC payloads and sender, deny navigation/windows/permissions. No backend, accounts or runtime network dependency.
- UUID and 10-digit human serial are permanent. Zero is reserved. Allocate atomically, enforce uniqueness and immutability in SQLite, retain historical ranges, never renumber cards. Changing ranges affects future cards only.
- All metadata is optional. Persist blank text as null; fallback labels are display-only. Submitted by is free text and must NEVER enter future public output. No tags or person directory.
- Preserve autosave ordering, error recovery and close/navigation flush protection. Never discard unsaved edits silently. Use explicit deliberate buttons for workflow actions; no convenience shortcuts.
- Use ordered transactional migrations; never edit a migration already released. Reject newer schemas. Preserve originals; thumbnails and future public output are rebuildable.
- Dark, restrained desktop UI. Bound catalogue queries and rendered rows. Avoid enterprise dashboards and unnecessary frameworks.
- Update docs for new architectural decisions. Run `pnpm check`, `pnpm package`, and `pnpm test:desktop` for foundation changes. Packaging validation on the host does not prove other OS builds; use the native OS CI matrix. Do not claim checks that did not run.
