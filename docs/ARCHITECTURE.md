# Architecture and engineering decisions

## Foundation

Electron + electron-vite + React + TypeScript, packaged with electron-builder. Exact resolved dependencies are committed in `pnpm-lock.yaml`; Electron and packaging tool are explicitly pinned. Node 24+ is required for development/tests. No backend, authentication, telemetry or runtime network dependency.

- `src/main`: application lifecycle, folder dialogs, installation preferences, database/migrations and validated IPC handlers.
- `src/preload`: a narrow `window.cards` facade, no raw IPC, Node, SQL or filesystem exposure.
- `src/shared/contracts.ts`: operation/result types, metadata keys, page size and serial formatting; safe in either process.
- `src/renderer`: React UI, ordered autosave controller; no database/filesystem imports.
- `tests`: storage, migrations, autosave and real Electron UI/relaunch checks.

### SQLite choice

Use Electron's bundled `node:sqlite` `DatabaseSync` rather than a separately compiled native addon. Electron supports this builtin (the missing builtin was fixed in Electron PR 47706); it ships with each supported Electron platform/architecture. This removes addon ABI rebuilds, prebuilt binary selection and ASAR unpack rules. Only long-established DatabaseSync/statement APIs are used. Node's SQLite API has carried experimental/release-candidate status; this is an explicit tradeoff for packaging simplicity. Pin Electron, exercise the bundled database in desktop/package tests, and revalidate on upgrades. A small repository service keeps a future driver swap contained.

Synchronous short SQLite operations run in main. This is intentionally simple for a personal catalogue. Bounded reads (100 rows) and an indexed updated-date ordering prevent whole-library rendering. Long media/export/archive operations should move to dedicated workers in later milestones; move database work off the UI main thread only if measured workloads warrant it. No ORM or server.

### Library layout

```
<chosen folder>/
  catalogue.sqlite
  catalogue.sqlite-wal       # SQLite managed while open
  catalogue.sqlite-shm       # SQLite managed while open
  media/originals/           # originals, future milestone
  cache/thumbnails/          # disposable generated files, future milestone
```

New libraries require an empty directory. Existing libraries require a recognized migration table; missing/unrecognized databases are not silently recreated. Opening creates missing cache/media directories. If remembered library cannot open, show an error and allow explicit selection, preserving the old location and files. Do not delete/move a live library or put it on a network/shared-sync filesystem. This app provides no synchronization.

`userData/preferences.json` contains the installation UUID and last library folder. Writes use a flushed temporary file and atomic rename. Malformed installation identity fails visibly instead of silently issuing a new identity. Workstation names and all range history live in the library database keyed by installation UUID, so relevant names/ranges accompany the catalogue. Names are per-library for the same installation (intentional decision; avoids a second settings synchronization mechanism). A newly installed copy opening an existing library must configure its own allocation. The UI does not expose the internal UUID.

## Schema and integrity

Ordered, transactional SQL migrations recorded in `schema_migrations`. Never rewrite released migration history. Reject newer/non-contiguous histories rather than guessing. SQLite foreign keys enabled, WAL journal, FULL synchronous durability and a five-second busy timeout. Single app instance on an installation, single window; revision checks also protect against a second process editing a card.

Initial tables: installations, allocations, cards. Allocations retain retired rows and allow only one current row per installation. Card rows reference their originating allocation. Card UUID/serial/allocation identity cannot be changed by UPDATE (database trigger). Serial is unique, exactly ten digits, nonzero. Numeric range/pointer values use safe JS integers; all ten-digit values fit exactly. The internal pointer may equal range end + 1 to represent exhaustion; user-configured pointers must be inside the range. Exhausted settings require a valid pointer or new range before saving.

Creation runs in BEGIN IMMEDIATE: read current range, find the first unoccupied serial at/after the pointer, insert card and advance pointer, commit together. Collisions are skipped during issuance, never reused. Setting the pointer to an already issued value is rejected. Ranges belonging to other installations (including historical ranges) cannot overlap in the same catalogue; this is a conservative protection. A workstation may revisit its own old range, but still cannot reuse issued serials. Local uniqueness does not guarantee uniqueness across disconnected catalogues; users must coordinate allocations manually.

Card metadata are nullable TEXT, including Year (free text avoids imposing unrequested identification validation). Whitespace-only values normalize to null; nonblank text preserves user formatting. Limit each field to 20,000 characters as an IPC/resource guard. No placeholders stored. Card status defaults to in_progress; includePublic defaults true. Revision and UTC ISO timestamps accompany records. The list's “Unnamed Card” is only a fallback.

## Secure boundary

BrowserWindow: contextIsolation=true, nodeIntegration=false, sandbox=true, webSecurity=true. Preload only exposes named operations, never a generic invoke API. Main validates the sender window, top-level frame and exact trusted renderer URL, plus runtime input types/ranges/field allowlists. Replies are discriminated success/error objects. SQL values are parameterized; interpolated column names come exclusively from the static metadata allowlist. Renderer navigation, new windows, webview attachment and permission requests are denied. Production CSP restricts scripts/styles to self. A development-only Vite transform allows its inline React preamble and hot styles; HMR websocket connections are allowed. Production builds never include the inline-script allowance. No remote content is loaded. Production ignores development URL environment overrides. No workflow shortcuts or menu accelerators for card actions. A macOS Edit menu preserves standard text-editing shortcuts; its explicit Quit menu item uses the same protected close flow.

## Autosave and failure behavior

An editor-local controller owns a 300ms debounce, latest draft, revision and a single serialized save loop. Typing during an in-flight request stays in the draft and is written in a subsequent revision. Old responses cannot overwrite newer typing. Save status distinguishes pending/saving/saved/error. Failures retain the draft with a Retry action; optimistic revision mismatch blocks silent overwrite.

Card changes, library changes, configuration and creation first flush saves. UI mutation actions are serialized. Close requests use main→preload→renderer flush handshake; main only closes when the queue drains successfully. Failure/timeout keeps the app open with a message. This protects normal close/quit, not forced process termination/power loss during the debounce interval. “All changes saved” means SQLite committed, not merely queued. No automatic backups are created.

## Future extension boundaries (not implemented)

- Inspection: separate one-to-one data keyed by card ID; store authoritative measurements as integer hundredths of mm and grades as integer tenths (planned decision to avoid floating-point formatting drift). Derive ratios. Retain required-inspection revision/finalized revision so subsequent required changes can be indicated without irreversible locking. Exact finalization/skew details must be designed with tests before implementation.
- Photos: separate rows with relative original/thumbnail paths, slot or additional classification, title and lock flag. Enforce one primary image per card/slot using a partial unique index. Generate thumbnails, never modify originals in place. Resolve paths securely in main and use restricted media serving, not arbitrary filesystem access.
- Defects: marker rows with side/normalized coordinates/note, plus a many-to-many join to same-card photos. No taxonomy required.
- Export: explicit public DTO allowlist excludes submittedBy; filter finalized AND includePublic; deterministic full generated manifest with stale-file removal confined to owned output. No Git operations. Do not export database rows wholesale.
- Archive: consistent SQLite snapshot (backup API or checkpointed copy with writes paused), originals, relevant install/library settings; ZIP `.cug`, exclude thumbnails. Restore validates archive paths/schema and stages before replacing a library. No merges or automatic backups.

## Build and cross-platform validation

Electron-vite builds separate main, sandbox-compatible CommonJS preload and browser renderer outputs. electron-builder packages `out` plus package metadata into ASAR; no native npm addon requires rebuilding. macOS targets DMG/ZIP, Windows NSIS, Linux AppImage/DEB. Native CI matrix packages each OS, runs unit/type/build checks and runs the same Electron create/edit/close/relaunch integration test against the packaged executable. Linux uses Xvfb for UI tests. The shipped Electron runtime therefore exercises actual SQLite on each OS when CI runs.

Local macOS packaging does not validate Windows/Linux binaries. Native CI is the verification gate; do not claim successful matrix runs before observing them. Signing/notarization, installer branding/custom icon and distributable release credentials are outside this foundation; local packages are unsigned. Do not disable Electron's sandbox to make tests pass.

## References checked during implementation

- [electron-vite guide](https://electron-vite.org/guide/) and [production build](https://electron-vite.org/guide/build): maintained Vite main/preload/renderer toolchain.
- [Node SQLite API](https://nodejs.org/api/sqlite.html): builtin driver and API stability caveat.
- [Electron builtin SQLite fix](https://releases.electronjs.org/pr/47706): builtin availability in Electron.
- [electron-builder documentation](https://www.electron.build/docs/): cross-platform targets and packaging.

See README for exact commands and `docs/VALIDATION.md` for observed validation results and manual checks.
