# Validation history

## Public report Defect Map placement

Observed on 2026-09-13, macOS arm64, using disposable libraries and site folders. The only production changes move the intact Defect Map after the Corner/Edge photo grid and advance `REPORT_FORMAT_VERSION` from 2 to 3. Snapshot format/schema remain 2, image pipeline remains 1, and content fingerprints are unchanged.

- `pnpm check` passed strict TypeScript, all 50 service/integration tests, and the production build. Focused tests verify Centering → Corners → Edges → Defect Map, one occurrence of every section, marker/details/evidence content, and the unchanged zero-defect empty state. Updating report format 2 to 3 rewrites HTML without changing public card data/fingerprint or running image processing; derivative modification times remain unchanged.
- Current foreign reports and explicit legacy/orphaned snapshots rebuild in the new order without their source libraries, preserving ownership and media. Existing privacy and root/`/project/` static-host tests pass.
- All six real Electron workflows passed after extending the fixture with Corner/Edge photos, front/back defects and Additional evidence. Browser checks verify section order and that the Defect Map's visual position is below the photo grid, marker selection/details, evidence lightbox and Escape at both `/` and `/project/`. A zero-defect report retains “No defects documented.” in its new position. The full report, Corner/Edge grid, populated Defect Map and empty Defect Map captures were visually reviewed; styling is unchanged. The old single-marker geometry assertion was updated to check both fixture markers.
- Strict TypeScript was rerun after that test assertion fix; `git diff --check` passed. No database migration or package rebuild was needed/requested.

## Physical centering measurement workflow

Observed on 2026-09-13, macOS arm64, using disposable catalogues and profiles. This is a renderer-only reorder: no database, migration, public snapshot/report, formula, finalization, archive or autosave changes.

- Both faces retain four styled panels: Top/Upper on the first row, Bottom/Lower on the second. DOM order is Top, Bottom, Upper, Lower, producing the requested eight-field Tab sequence per face without explicit tab indexes. Below 760px, panels stack in DOM order.
- Electron tests check both faces' actual input DOM order, forward/reverse keyboard focus at laptop and 720px widths, panel coordinates at wide and narrow widths, and every helper icon's association with its label. Unique values in all 16 inputs survive immediate Overview/Inspection navigation. Asymmetric values confirm Vertical Left still compares Top Left/Bottom Left, Vertical Right compares Top Right/Bottom Right, and horizontal comparisons are unchanged.
- Laptop Front/Back and narrow Back captures were visually reviewed. Existing panel styling, inputs, units, icons, spacing and skew presentation remain recognizable. Vertical ratio footers now state their Top/Bottom comparison explicitly, independently of the input grouping.
- `pnpm check` passed: strict TypeScript, all 49 service/integration tests, and production build. `pnpm test:desktop` passed all six workflows, including the focused layout/focus/icon/ratio/autosave coverage and existing navigation/photo/public-site/archive behavior. No lint command is configured.
- `pnpm test:development` passed startup, renderer reload and trusted IPC; `git diff --check` passed. Package artifacts were not rebuilt for this UI-only task.

## Front and Back centering model

Observed on 2026-09-13, macOS arm64, using disposable catalogues, profiles, archives and public-site folders. No user library was migrated during validation.

### Model, compatibility and UI

- Migration 6 preserves all eight existing measurements as explicitly named Front fields, adds eight nullable Back fields, and advances only finalized assessment revisions once. It retains grades, card/serial/library identities, timestamps and finalized revisions, photo/marker/link records, allocation history and reservations. Opening again does not repeat the migration. Previously finalized cards show changes pending and require Back plus re-finalization.
- Finalization requires all 21 numeric values. Tests omit each of the 16 measurements and five grading inputs in turn; all fail cleanly. Front/Back values save independently, retain hundredths and nulls, and required edits on either face invalidate finalization. Photos, markers, metadata and notes remain optional.
- Each face uses the unchanged four directional ratios and the unchanged 63.5 × 88.9 mm apparent-skew assumptions, 1° contradiction threshold and 0.05° neutral threshold. Calculation coverage verifies directional results, independent face changes, CW/CCW, contradiction and near-zero behavior.
- Inspection renders one Centering grade/note, then Centering Front and Centering Back stacked within one measurement panel. All 16 fields have subtle inline SVG card/double-headed-distance-arrow helpers, reusing eight positions with accessible text labels. Real Tab/Shift+Tab coverage traverses all Front fields then Back fields and reverses that sequence; decorative helpers have `aria-hidden` and no tab index. Captures at 1050×760 and the narrower desktop window were inspected: fields stay contained, the divider is restrained, and the sticky identity/navigation remain usable.
- Public report format 2 and snapshot format 2/public schema 2 include both faces and one Centering subgrade. Back edits change the public fingerprint. Exact current-schema validation rejects a missing Back field without changing the prior report. Explicit legacy format/schema 1 parsing verifies the original fingerprint, maps old values only to Front for presentation, and shows that Back was not recorded. Foreign/orphaned legacy reports and their media survive Update/Rebuild; migrated ineligible local-owned reports disappear on Update and return only after completion/re-finalization.
- The real Electron public-site workflow generates realistic independent Front CW and Back CCW reports, captures desktop (1280×900), laptop (1000×760) and mobile (420×800) presentation, checks no laptop/mobile horizontal overflow, and retains search, defects, linked evidence, viewer and privacy behavior. Detailed laptop/mobile centering captures were visually inspected: both faces remain stacked, ratios and raw values are readable, and mobile technical information stacks beneath each face's ratios. Existing root and `/project/` static-host coverage passes. Public snapshots/output remain allowlisted with no private values, internal UUIDs or local source paths.
- Archive format remains `.cug` ZIP version 1. Tests archive schema 6 and verify distinct Front/Back measurements plus finalization state survive restore naturally in the SQLite snapshot.

### Validation results

- `pnpm check`: strict TypeScript, all 49 service/integration tests, and production main/preload/renderer build passed. No separate lint command is configured; strict TypeScript checks unused code.
- `pnpm test:desktop`: all six Electron workflows passed, including a Back edit immediately before protected Command+Q, close/relaunch persistence, tab navigation flush, all existing photo/navigation/archive/public-site behavior, and visual captures.
- `pnpm test:development`: startup, renderer reload and trusted IPC passed.
- `pnpm test:packaged`: all six Electron workflows passed against the exact rebuilt macOS arm64 application, including Back save/quit/relaunch, report rendering, real Sharp processing and existing workflows.
- `git diff --check`: passed.
- `pnpm package:all`: current version 0.1.0 macOS arm64 DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/DEB packages were rebuilt. Structural validation passed for executable/native Sharp/libvips format and architecture, current Front/Back model markers, version and required artifacts. SQLite remains Electron's target-native builtin. Exact sizes/checksums are recorded in `release/package-manifest.json`; the artifact table below is refreshed to this run. Windows/Linux were not runtime-tested here.

### Recommended native/manual checks

1. Archive a disposable older library before opening it. Confirm old values appear only under Front, Back is blank, finalized history remains and the state is changes pending. Fill Back, finalize again, close and relaunch.
2. At normal display scale on a laptop, review all eight helper positions on both faces, natural Tab/Shift+Tab order, partial/invalid input, fixed two-decimal formatting and independent ratios/skew.
3. Update a shared site with an ineligible migrated local card and legacy foreign report: only the local report should disappear. Complete/re-finalize it and verify both-face output returns. Rebuild with the foreign source unavailable and confirm its explicit legacy Back notice and images remain.
4. Repeat Back save/quit/relaunch, archive/restore, photo processing and public-site Update/Rebuild in native Windows/Linux packages. Structural cross-packaging on macOS cannot prove their runtime behavior.


## Multi-library Public Site publishing

Observed on 2026-09-11, macOS arm64, using disposable Library A, Library B, collision, archive/restore and static-site folders. This generator-only change adds no SQLite migration or new renderer filesystem authority.

### Model and safety exercised

- Owner derivation is deterministic SHA-256 over the fixed `cards-under-glass-public-owner:` domain plus immutable lowercase library UUID. Distinct UUIDs produce distinct 64-character keys. Only the per-card public snapshot carries the opaque owner key; generated HTML, catalogue/search JSON, JavaScript, the global ownership manifest and media never contain the raw library UUID, installation/workstation identity, card/marker/photo UUIDs, local paths, Submitted by, General Notes or unlinked Additional Photos.
- Every published serial receives `data/cards/<serial>.json` snapshot format 1/public schema 1. Exact-key/type/path validation, sequential public marker numbers and fingerprint verification reject malformed or private-field-expanded snapshots before destination mutation. The site ownership manifest is format 2/generation state 2 and owns only five shared/global files.
- Library A published two reports, then Library B published two non-overlapping reports into the same destination. Both catalogues were combined in serial-descending order. B's no-op update preserved A snapshot/report/media nanosecond modification times. A and B updates/removals affected only their own cards; the other library's files remained.
- A third library attempted to publish A's serial. Collision preflight returned the allocation-range guidance and byte comparisons proved the prior manifest and catalogue were unchanged.
- A report-format-version bump rebuilt both owners' report HTML from snapshots after Library A was closed. Its public image bytes and modification time remained unchanged. An image-pipeline bump while B was active processed only B's source photo and retained A's derivative unchanged.
- Separate A/B sites were externally combined by copying B's snapshot, report and media into A's destination while leaving deliberately stale global catalogue/search files. A subsequent A Update preserved B's files and reconstructed `index.html`/`data/reports.json` from both snapshots.
- A format-1 incremental site migrated an attributable local report without rerunning image processing. A deliberately unattributable legacy report remained byte-for-byte in place, received no invented owner/snapshot, and produced a non-destructive warning.
- Library A was archived to `.cug`, restored, opened under a different installation identity and shown to derive the same owner from the restored immutable library UUID. The restored catalogue updated and then removed its prior report without ownership configuration.
- Rebuilt multi-library output was served successfully both at `/` and `/project/`; combined catalogue, both serial report URLs and foreign image references returned successfully. Existing root/subdirectory search, lightbox, report and privacy validation continues to pass.

### Automated results

- `pnpm check`: strict TypeScript, all 45 service/integration tests, and the production Electron/Vite main/preload/renderer build passed.
- `pnpm test:desktop`: all six Electron workflows passed, including the renamed **Rebuild Public Site…** confirmation, Update/Rebuild output, static catalogue/search/report/lightbox behavior, privacy checks and existing persistence/navigation/photo/archive coverage.
- `pnpm test:development`: the Electron/Vite development application loaded, reloaded and retained the trusted typed IPC boundary.
- `pnpm package:all`: rebuilt version `0.1.0` macOS arm64 DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/DEB packages from current source. All packages passed current-feature-marker, executable architecture, Sharp/libvips target-binary and artifact validation; `release/package-manifest.json` records their sizes and SHA-256 checksums.
- `pnpm test:packaged`: all six Electron workflows passed by launching the exact rebuilt macOS arm64 package, including public snapshots, Update/Rebuild, privacy, static serving, archive, photo, navigation and persistence paths.
- `git diff --check`: passed.
- No separate lint command is configured; strict TypeScript checks unused locals and parameters.

### Manual target checks

1. Externally synchronize a shared site folder to Windows/Linux, run **Update Public Site** from a library with a distinct serial range, and confirm existing foreign reports and images keep their timestamps/content.
2. Test an intentional duplicate serial and confirm the visible collision message appears before any site file changes.
3. Run **Rebuild Public Site…** with an originating library unavailable and confirm its orphaned report and images remain usable.
4. Exercise the external-tool workflow: pull/synchronize first, Update, then synchronize/push. For a simulated global-file conflict, retain independent `data/cards` snapshots/media and rerun Update to repair the aggregate.

## Remembered native photo-picker directory

Observed on 2026-09-11, macOS arm64. All application profiles, libraries, source folders and images were disposable test data. This workflow-only change adds no SQLite migration or IPC/preload surface.

### Passed

- `pnpm typecheck`: strict TypeScript passed after extending the main-process preference shape and native-dialog behavior.
- The focused Electron test starts without a remembered location and verifies the first photo dialog omits `defaultPath`. A successful Front import stores its source parent in `userData/preferences.json`; Top Left Corner and Top Edge pickers receive the same directory.
- The same test imports two Additional Photos in one multi-selection and verifies the first selected file's parent becomes the shared directory. A cancelled Back picker leaves it unchanged, and primary replacement receives that same `defaultPath`.
- After the remembered source folder is deleted, two subsequent native picker calls omit `defaultPath` without an error. Cancelling the first retains the unavailable value; successfully importing Back from another folder replaces it.
- After a full application close/relaunch using the same Electron user-data profile, repeated Corner picker cancellations both receive the newly remembered directory, proving restart persistence and cancel retention.
- The test uses nested paths through Node `path` APIs and asserts dialog option values rather than parsing path separators. Renderer/preload contracts and drag/drop import remain unchanged.
- `pnpm check`: strict TypeScript, all 41 service/integration tests, and the production main/preload/renderer build passed. There is no separate lint configuration; strict TypeScript checks unused locals and parameters.
- `pnpm test:desktop`: all six Electron workflows passed, including the new picker test and all existing navigation, grading, Photos, Archive/Restore, static-site and persistence behavior.
- `pnpm test:development`: the Electron/Vite development app loaded, reloaded and retained trusted IPC behavior.
- `pnpm package:all`: current macOS arm64, Windows x64 and Linux x64 packages were rebuilt and passed structural/native validation with the new main-process behavior included.
- `pnpm test:packaged`: all six Electron workflows passed by launching the exact rebuilt macOS arm64 package, including picker-directory persistence across a packaged-app restart.
- `git diff --check`: passed.

### Manual checks

1. On each target OS, select a photo several folders deep, open another primary or Additional picker, and confirm it starts in the same folder.
2. Restart, open Replace Photo, and confirm it shares the remembered directory with every other photo-picker action.
3. Cancel twice and confirm the folder is retained. Then rename, delete, disconnect, or make the folder inaccessible and confirm the picker opens at the operating system fallback without an application error.
4. Import a photo from a new available directory and confirm subsequent pickers start there.
5. Drag a photo from a different directory, then open a native picker and confirm drag/drop did not change the remembered picker location.
6. Repeat the flow in the native Windows x64 and Linux x64 packages, including drive-root/network or removable-volume loss where practical. Those target-native picker behaviors cannot be runtime-proven by macOS tests.

## Cross-platform packaging and release builds

Observed on 2026-09-11 from macOS arm64. The release tree was cleaned before the final all-target run, so every artifact listed here came from the current source and version `0.1.0`. No user library was opened and no application feature or database migration changed.

### Packaging audit and implementation

- The existing toolchain was electron-builder 26.15.3 with macOS DMG/ZIP, Windows NSIS and Linux AppImage/DEB targets. Its former `package` command produced only a host unpacked directory, while `dist` used implicit host targeting. The native CI matrix also invoked that generic host command. These names did not provide one clear current release workflow.
- `release/win-unpacked` and `release/linux-unpacked` were older than the current macOS output and contained neither the unpacked Sharp runtime nor current Photos/Public Site feature markers. They were early-development packages, not current release candidates. The guarded clean step removed them before producing the artifacts below.
- `package.json` is the single application-version source. Explicit `package:mac`, `package:win`, `package:linux`, `package:all`, `package:clean`, and `package:validate` scripts now drive platform-separated output. The compatibility `package`/`dist` commands target the current host.
- pnpm installs Sharp optional binaries for the supported target OS/CPU combinations. The `afterPack` hook removes non-target `@img` binaries from each staged package, and the structural validator rejects missing, duplicate, foreign-format, or wrong-architecture Sharp/libvips files. SQLite uses Electron's target-native built-in `node:sqlite`, so there is no SQLite addon to rebuild.
- Linux DEB uses supported gzip payload compression. This avoids a hidden external `xz` executable prerequisite when electron-builder cross-packages the DEB on macOS.
- The native CI matrix now calls the explicit package script for each runner and uploads its current release tree. The packaged Electron suite runs directly on macOS/Windows and under Xvfb on Linux.

### Final artifacts and structural validation

`pnpm package:all` completed successfully from one current production build. This artifact table was refreshed on 2026-09-13 for the Front/Back centering milestone; `release/package-manifest.json` records its byte sizes and SHA-256 checksums.

| Artifact | Target | Format | Bytes | SHA-256 | Result |
| --- | --- | --- | ---: | --- | --- |
| `release/macos-arm64/cards-under-glass-0.1.0-mac-arm64.dmg` | macOS arm64 | DMG | 137,101,227 | `eaaf2ca93b0dd1c53b119e3b70f016de2c7f063c5b0e2890f70177eca8c9e0b0` | Built; Mach-O arm64 Electron and Sharp/libvips validated |
| `release/macos-arm64/cards-under-glass-0.1.0-mac-arm64.zip` | macOS arm64 | ZIP | 137,259,205 | `5d9a29720762cfa892cb6b1befeff71db7e0e6730e9fce58f4e6934979a826ed` | Built; same validated app bundle |
| `release/windows-x64/cards-under-glass-0.1.0-win-x64.exe` | Windows x64 | NSIS installer | 118,442,779 | `fc935db2f2baa8d48b2493726a52bc57b37aff50db5aab7c8a7cadffd16e1106` | Built; PE x64 Electron/Sharp runtime and current ASAR validated |
| `release/linux-x64/cards-under-glass-0.1.0-linux-x86_64.AppImage` | Linux x64 | AppImage | 134,892,239 | `95ca26440275d4098d448131beeb3efa0299a72b37b4ecea4a6588671780efad` | Built; ELF x64 Electron and Sharp/libvips validated |
| `release/linux-x64/cards-under-glass-0.1.0-linux-amd64.deb` | Linux x64 | DEB | 132,291,674 | `76cf514054e7ace781a796b5e49a11a014c0413bec869ae172f826cdd2092f35` | Built; same validated application payload |

The validator also inspected every ASAR for package version/name plus current SQLite migration, Archive/Restore, Photos, Update Public Site, Rebuild Public Site and multi-library snapshot/owner markers. Mac output contains only Darwin arm64 image binaries, Windows only PE x64 Sharp files, and Linux only ELF x64 Sharp/libvips files. Expected installers exist and no Sharp runtime is accidentally externalized or absent.

### Passed

- `pnpm install --frozen-lockfile --offline`: the committed lockfile and installed multi-platform dependency graph agree.
- `pnpm check`: strict TypeScript, all 41 service/integration tests, and current production main/preload/renderer build passed. There is no separate lint command; strict TypeScript checks unused locals and parameters.
- `pnpm test:desktop`: all six Electron application tests passed against the production bundles.
- `pnpm package:all`: macOS arm64 DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/DEB were rebuilt after a guarded clean and passed automated structural/native validation.
- `pnpm test:packaged`: all six Electron tests passed by actually launching the newly packaged macOS arm64 application. This exercises Electron's built-in SQLite, real Sharp photo/public-site processing, current migrations, persistence, Archive/Restore, incremental public-site generation and remembered photo-picker state.
- `pnpm test:development`: Electron/Vite development startup, renderer reload and trusted IPC passed.
- Node syntax checks passed for all packaging helpers; `git diff --check` passed.

Windows and Linux artifacts were built and structurally validated on macOS, not launched here. Cross-packaging success is deliberately not called runtime validation. The native CI jobs or manual target machines must still exercise their installer/package, dialogs, user-data locations, filesystem behavior, bundled SQLite, and Sharp processing. macOS x64/universal, Windows/Linux ARM, signing, notarization, custom icons, auto-update and release upload remain outside this milestone.

### Windows manual smoke test

1. Copy `cards-under-glass-0.1.0-win-x64.exe` to an x64 Windows PC and install it. Note the expected unsigned-app warning.
2. Launch Cards Under Glass and create a library in a new local folder.
3. Reopen an existing library if available and confirm existing cards appear in serial-descending order.
4. Open a card deliberately in Card Grading and move through Overview and Inspection.
5. Open Photos and confirm existing thumbnails and full-resolution viewing.
6. Import a JPEG/PNG/WebP, view it, then relaunch and confirm Sharp-created thumbnail persistence.
7. Create a test card and confirm its permanent ten-digit serial does not reuse a retired serial.
8. Enter the 21 required grading values, finalize, edit a required grade, and verify changes-pending/re-finalization.
9. Run **Update Public Site** into an empty folder and open the generated catalogue/report through an ordinary static server.
10. Run Update again, verify unchanged reports are skipped, then exercise **Rebuild Public Site**.
11. Close through the normal Windows close/Exit path while an autosave is pending; reopen and verify the edit persisted.
12. Create a `.cug` archive, restore it into a new empty folder, open it, and verify cards, serial reservations, photos, defect links, and lazy thumbnails.

### Linux manual smoke requirements

1. Test the AppImage on a current x64 glibc desktop, including executable permission/FUSE behavior or the platform's documented AppImage extraction fallback.
2. Install the DEB on a supported Debian/Ubuntu x64 system and confirm desktop-menu launch and uninstall behavior.
3. Repeat the Windows functional checks for library create/open, migrations, grading/finalization, photos and real Sharp processing, Archive/Restore, Update/Rebuild Public Site, normal close, relaunch and persistence.
4. Exercise native file/folder dialogs and paths containing spaces/non-ASCII characters. Confirm Electron user data uses the platform location while the selected library remains portable.
5. Run the packaged Playwright suite under Xvfb or a real desktop. Record the distribution/version because AppImage/FUSE and DEB dependency availability vary by Linux environment.

## Incremental Public Site generation

Observed on 2026-09-11, macOS arm64. Every library, source image, generated site, profile and static server used disposable test data; no user library or hosting account was accessed.

### Passed

- `pnpm check`: strict TypeScript, all 41 service/integration tests, and the production main/preload/renderer build passed. There is no separate lint command/configuration; strict TypeScript checks unused locals and parameters.
- Public fingerprint tests prove deterministic equality for identical public models and invalidation by public metadata, grades, centering, defect position/note, photo content, evidence links and public Additional titles. Editing only Submitted by or General Notes leaves the fingerprint and report file unchanged, and the generated manifest contains neither private value.
- The realistic two-card incremental sequence measured two new reports/two image jobs on its initial Update, then two unchanged reports, zero new image work and unchanged report modification times on a no-op Update. One public metadata edit rewrote only that report and no images. Replacing one Front image ran one catalogue/preview/large derivative set; replacing one Corner ran only its preview/large set. Deleting one generated preview repaired only that variant.
- The same sequence added one new eligible report, removed only the disabled report and its media, removed a grading-changed card while it was **Finalized — changes pending**, and regenerated only that card after re-finalization. Private-only edits again produced two unchanged reports and zero image work. A full rebuild then rewrote every eligible report and derivative.
- Manifest compatibility coverage converts an earlier format-1 ownership-only file on the first Update. Report-version changes rewrite card HTML without image processing; image-pipeline changes rebuild images without touching current report HTML. Unknown files, `.git/config`, and `CNAME` survive full rebuild while stale generator-owned output is removed.
- Static-host integration uses real Sharp WebP output after incremental eligibility removal. Catalogue, search, report pages, CSS, JavaScript and media serve successfully at `/` and `/project/`; the removed report returns 404 at both paths.
- `pnpm test:desktop`: all five real Electron tests passed. In the six-card Settings flow, the first Update reports `6 new`, the immediate second Update reports `6 unchanged`, and the confirmed full rebuild reports `6 reports rebuilt`. The confirmation can be cancelled, output-folder persistence and user-managed `CNAME` remain intact, and private data remains absent. The new Settings controls were captured and visually inspected; Update is clearly primary while Rebuild is deliberate and secondary.
- `pnpm package` produced a fresh unsigned macOS arm64 application under `release/mac-arm64`. `pnpm test:packaged` passed all five Electron tests against it, including the incremental/no-op/full-rebuild flow and real WebP generation. `pnpm test:development` loaded and reloaded the Electron/Vite renderer successfully with trusted typed IPC. `git diff --check` passed.

No SQLite migration was needed. Incremental state lives only in the disposable generated-site ownership manifest. The local package is unsigned and still uses Electron's default icon. macOS validation does not prove Windows/Linux packaging or their Sharp binaries; the existing native CI matrix remains the platform-specific gate.

### Manual checks

1. Update a large existing generated site made by the previous application version. Confirm the first run may regenerate eligible reports once, later no-op runs report them unchanged, and no manual manifest editing is required.
2. On a library with hundreds of real photographs, watch **Checking reports**, changed-photo processing and the final new/updated/removed/unchanged summary. Confirm a no-op Update is substantially faster and does not change per-card report/image modification times.
3. Change one public field, re-finalize a changed grade, replace one Front image, and replace one Corner or Edge image. Confirm only the relevant report and photo variants receive new modification times.
4. Delete one catalogue, preview or large derivative from an otherwise current report, run Update, and confirm only the missing variant is repaired.
5. Exclude, delete, or make a public card changes-pending. Confirm its page/media/search entry disappear on Update, then re-enable/re-finalize where applicable and confirm it returns.
6. Edit distinctive Submitted by and General Notes values only. Confirm Update reports the card unchanged and those values do not appear in `.cards-under-glass-site.json` or any generated file.
7. Generate inside a disposable Git working tree containing `.git`, `.github`, `CNAME`, README and unknown files. Exercise both Update and Rebuild and confirm every user-managed byte survives.
8. Serve the incrementally updated result at a domain root and beneath a project path. Exercise search, predictable serial URLs, defect selection, every photo size and the lightbox on desktop and mobile.
9. Start Update or Rebuild after editing an autosaved field, then try to close with Command+Q. Confirm the save drains and the active generation completes safely before exit.
10. Repeat package/runtime and large-photo checks on Windows and Linux through the native validation matrix.

## Public catalogue and report visual polish

Observed on 2026-09-11, macOS arm64. All generated sites, source images, libraries, profiles and output folders were temporary test data.

### Passed

- `pnpm check`: strict TypeScript, all 38 service/foundation tests, and the production main/preload/renderer build passed. Catalogue assertions cover the **Card Reports** heading, 0/1/plural grammar, shared photo/placeholder media structure, dedicated Front catalogue paths, lazy markup, report-only preview/lightbox paths, stronger semantic Card Name hierarchy, search, privacy and owned stale cleanup. The project has no separate lint command/configuration; strict TypeScript checks unused locals and parameters.
- Sharp integration checks verify a 420-pixel catalogue bound distinct from the 900-pixel report preview, correct portrait/landscape orientation, no enlargement of small originals, and unchanged library-original bytes.
- `pnpm test:desktop`: all five real Electron tests passed. The static-site flow generates six serial-descending reports: three with Front photos (including portrait and landscape sources) and three with placeholders. It compares every media-region height, searches by unpadded serial, confirms singular filtered wording, opens the report/lightbox, and captures the catalogue at 1280×900, 1000×760 and 420×800 for visual review. Those captures and the report were inspected; portrait, landscape and placeholder geometry remains aligned without blank skipped cards.
- Root and `/project/` static-host checks continue to validate catalogue, report, CSS, JavaScript, media references and search without a server runtime or rewrite rule.
- `pnpm package` produced a fresh unsigned macOS arm64 application under `release/mac-arm64`; `pnpm test:packaged` passed all five Electron tests against it, including generation and WebP processing. `pnpm test:development` loaded and reloaded the Electron/Vite renderer successfully with trusted typed IPC. `git diff --check` passed.

### Manual checks

1. Generate a large real catalogue and compare populated and photo-less tiles at desktop, laptop, tablet and phone widths. Confirm artwork stays contained, media heights align, grades remain legible and the grid never overflows horizontally.
2. In browser developer tools, scroll a long catalogue and confirm tiles request `*-catalogue.webp` lazily while `*-preview.webp` and `*-large.webp` remain report-only.
3. Search to 1, 0 and multiple matches and confirm **1 report**, **0 reports** and plural wording. Check padded and unpadded serial searches and the serial-descending default order.
4. Replace/remove a public Front photo, exclude/delete a public card, and regenerate into a Git working tree. Confirm stale catalogue derivatives disappear while `.git`, `CNAME`, workflows and unknown files remain untouched.
5. Review long, short, non-Latin and HTML-like Card Names on a report. Confirm Card Name has clear hierarchy below the report number, escapes safely and does not disturb the established report layout.

## Public Static Site Generator

Observed on 2026-09-11, macOS arm64. All generated sites, source libraries, output folders and application profiles were disposable test data; no user library or hosting account was used.

### Passed

- `pnpm check`: strict TypeScript, all 38 service/foundation tests, and the production main/preload/renderer build passed. There is no separate lint command/configuration; strict TypeScript checks unused locals and parameters.
- Public generation tests build a real populated site containing finalized cards with full/partial/no photos, fixed-precision grading, notes, centering, defects, linked primary and Additional evidence, plus deliberately private Submitted by, General Notes and unlinked Additional media. Eligibility tests exclude In Progress, changes-pending and public-disabled cards. Generated output was recursively inspected to prove private values, internal card/marker UUIDs and unlinked Additional photo data were absent.
- URL/search tests verify `cards/<10-digit serial>/index.html`, serial-descending catalogue order, public-only JSON fields, exact leading-zero-tolerant serial ranking, ordinary text search data, relative root/subdirectory asset links, and no host-specific rewrite/runtime dependency.
- Photo tests verify actual Sharp WebP derivatives, 900-pixel preview bounds, 2400-pixel lightbox bounds, no enlargement, one derivative pair reused across multiple defect references, every primary-slot placeholder, linked Additional inclusion, and unlinked Additional exclusion.
- Output safety tests preserve `.git`, `CNAME`, README and unknown files; remove generated pages/media for excluded and deleted cards; reject unowned collisions, traversal and symlinked generated paths; and preserve the prior ownership manifest/site when derivative generation fails.
- A simple local static HTTP server successfully served catalogue, report, CSS and media at both `/` and `/project/`. The Electron browser test loaded the generated root site over HTTP, searched by unpadded serial, opened the predictable report URL, verified normalized defect-marker geometry and details, opened the static lightbox, and dismissed it with Escape.
- `pnpm test:desktop`: all five real Electron tests passed. The new Settings flow selects and remembers a library-scoped output directory, generates a finalized report after pending saves drain, preserves a user-managed `CNAME`, verifies private values are absent, and opens the result through local HTTP. The catalogue and full report screenshots were visually inspected; a CSP issue affecting inline normalized marker positions was found, fixed, and guarded by a browser geometry assertion.
- `pnpm package`: a fresh unsigned macOS arm64 package was produced under `release/mac-arm64` with Electron 44.3.0, SQLite and Sharp-backed generation.
- `pnpm test:packaged`: all five Electron tests passed against the fresh package, including public WebP creation, static report interaction, Archive/Restore, safe quit, persistence, Photos and defect links.
- `pnpm test:development`: the Electron/Vite development app loaded and reloaded successfully with trusted typed IPC.

No database migration was needed. The output destination is machine-local preference data keyed by immutable library UUID. Local packaging does not prove Windows/Linux runtime behavior; the existing native CI matrix remains the platform-specific gate. The host package is unsigned and still uses Electron’s default application icon.

### Manual checks

1. In Library settings, choose a new public-site folder, generate, close/reopen the app, and confirm that library’s destination remains selected. Switch libraries and verify each library has its own remembered destination.
2. Generate into a disposable Git working tree containing `.git`, `CNAME`, workflows and a README. Exclude/delete a previously generated card and regenerate; verify its page/media disappear while every user-managed file remains byte-for-byte intact.
3. Exercise reports with all primary photos, partial photos and no photos on a laptop, phone and tablet viewport. Check labels, intentional placeholders, Estimated Grade hierarchy, 2×2 Corner/Edge layouts and lack of horizontal overflow.
4. Verify a marker near every edge/corner stays positioned correctly as the browser resizes. Select markers with mouse and keyboard, inspect all notes/evidence, and test one photo linked to several defects.
5. Open primary and linked Additional images in the static lightbox, close with its visible control and Escape, and confirm large images preserve aspect ratio without loading broken files.
6. Search by exact padded serial, unpadded serial, Card Name, Card Number, Game, Set and Variant. Confirm exact serial rises first and default browsing remains serial descending.
7. Put distinctive secrets in Submitted by and General Notes, plus an unlinked Additional Photo. Generate and search all output file contents/media names; confirm none are present.
8. Put HTML/script-like text in every public text field and grading/defect note. Confirm it appears as text, never executes, and does not break report markup or search.
9. Attempt to generate over an unknown `index.html` or a symlinked `cards` path. Confirm a clear error, unchanged prior public site and usable active library.
10. Repeat generation with a large real-photo library and test the packaged workflow on Windows and Linux through the native validation matrix. Confirm progress remains responsive and Command+Q waits for an active generation before closing.

## Manual Library Archive and Restore

Observed on 2026-09-11, macOS arm64. All automated archives, catalogues, profiles, media, and restore destinations were disposable temporary data; no user library was opened.

### Passed

- `pnpm typecheck`: strict TypeScript passed across the archive service, migration 5 library identity, main/preload contracts, renderer operation state, and all tests. There is no separate lint command/configuration; strict TypeScript checks unused locals and parameters.
- `pnpm test`: all 34 tests passed. Archive tests verify ordinary ZIP bytes and manifest version 1, a WAL-safe SQLite online-backup snapshot, original media inclusion, thumbnail and nested-archive exclusion, complete private card/inspection/finalization/marker/photo/title/lock/link persistence, installation/range identity, permanent deleted-card serial reservations, lazy thumbnail regeneration, and immutable migration-5 library identity.
- Failure coverage rejects missing source media, malformed ZIPs, missing manifests, unsupported versions, undeclared/missing entries, altered database/media payloads, corrupt SQLite with a matching payload checksum, populated restore destinations, and Zip Slip paths. Failed create/restore operations leave the source library usable and do not commit a destination.
- `pnpm build`: production main, preload, and renderer bundles built successfully with the ZIP implementation included behind the typed main-process boundary.
- `pnpm test:desktop`: all four real Electron tests passed. The new workflow creates a card with private metadata, a noted defect and a titled/locked/linked original photo; creates a real `.cug` through Library settings; restores it through the native picker/confirmation flow into a separate empty folder; opens the restored library; verifies those records and original-image viewing; and observes an initially empty thumbnail cache rebuilding on demand.
- The generated Library settings screenshot was visually inspected at the test window size. Backup and restore are clearly separated, explanatory copy identifies `.cug` as ZIP and thumbnails as derived, the replacement/recovery warning is visible, and the established dark settings design remains intact.
- `pnpm package`: a fresh unsigned macOS arm64 application was produced under `release/mac-arm64` with Electron 44.3.0.
- `pnpm test:packaged`: all four Electron tests passed against that packaged application, including real `.cug` creation, validated staged restore, normal-library opening, and original/thumbnail image loading.
- `pnpm test:development`: the electron-vite development server and renderer loaded/reloaded successfully with trusted IPC.
- `git diff --check`: no whitespace errors.

The local package is unsigned and does not validate Windows/Linux execution. The existing native CI matrix remains the platform-specific packaging/runtime gate. Restore format 1 begins at database schema 5; future compatible schema migration behavior must remain covered when later schemas are added.

### Manual checks

1. Create an archive from a large real-photo test library to an external folder. Watch the busy/progress state, confirm other mutation controls cannot start a competing operation, and rename a copy from `.cug` to `.zip` to inspect `manifest.json`, `database/catalogue.sqlite`, and `media/originals`.
2. Type into Overview, an inspection note, marker note, and Additional Photo title immediately before Create. Restore the archive and confirm every last edit was drained before the snapshot.
3. Save an archive inside the active library, then create another archive elsewhere. Inspect it and confirm the nested `.cug`, `cache/thumbnails`, SQLite WAL/SHM, and unrelated files are absent.
4. Temporarily move one original from a disposable library, create an archive, and confirm a clear safe failure with no partial output. Put it back and confirm the working catalogue was never changed.
5. Restore a valid archive into a new folder and into an existing empty folder. Confirm the app switches only after success, all private metadata/grading/markers/photos/links survive, and locked photos remain locked.
6. Confirm the restored thumbnail folder begins empty, then visit Library preview and Photos. Verify requested thumbnails reappear from originals and full-resolution viewing works.
7. In a disposable source library, delete a card before backup. Restore, move Next serial back to that deleted serial, and verify it is rejected/permanently skipped while historical/current allocation rows and workstation name remain intact.
8. Attempt restore into the active library, its parent/child, and a populated unrelated folder. Confirm each is rejected without modifying the active library or destination contents.
9. Cancel each native save/open/folder dialog and the final restore warning. Confirm no archive job remains busy and the current library stays active.
10. Repeat create/restore with multi-gigabyte practical photo data and paths containing spaces/non-ASCII characters, then exercise the packaged workflow on Windows and Linux through the native validation matrix.

## Linked-defect disclosure state polish

Observed on 2026-09-11, macOS arm64. No check used a real user library. This renderer-only session-state change adds no database migration or IPC contract change.

### Passed

- `pnpm typecheck`: strict TypeScript passed for the card-scoped expanded-photo set and controlled disclosures.
- `pnpm test`: all 29 database and foundation tests passed.
- `pnpm build`: production main, preload and renderer bundles built successfully.
- `pnpm test:desktop`: all three Electron UI tests passed. Coverage expands both a primary and an Additional photo disclosure, leaves an unrelated Additional disclosure closed, navigates through Inspect, verifies the same expansion set and Photos scroll on return, and removes an expanded photo before navigating again to verify stale state is pruned safely. Existing targeted marker selection, shared Inspection viewer, lock, replacement, rename, deletion, relaunch, autosave and Library/Card Grading navigation checks remain green.
- `pnpm package`: a fresh unsigned macOS arm64 application was built under `release/mac-arm64`.
- `pnpm test:packaged`: all three Electron UI/relaunch tests passed against the fresh package.
- `pnpm test:development`: the electron-vite development server and React renderer loaded/reloaded with trusted IPC.
- `git diff --check`: no whitespace errors.

There is no separate lint command/configuration; strict TypeScript includes unused-local and unused-parameter checking. Expansion state intentionally resets across application restart and when another card becomes active. Windows and Linux remain native CI/runtime verification items.

### Manual checks

1. Expand several primary and Additional photo marker lists, use Inspect from one of them, and confirm the same set is expanded when returning to Photos while unrelated lists remain closed.
2. Repeat from near the bottom of a long Additional Photos gallery and confirm the disclosure and scroll position together provide the expected visual anchor.
3. Collapse one of several restored disclosures and confirm the others remain open through another Inspection round trip.
4. Remove or replace an expanded photo and confirm later tab navigation neither restores a stale disclosure nor reports an error.
5. Relaunch and confirm disclosure expansion resets while all persisted photo/marker links remain unchanged.

## Milestone 6 navigable defect/photo evidence

Observed on 2026-09-11, macOS arm64. No check used a real user library; automated Electron runs created disposable libraries and media. This renderer/state milestone adds no database migration or IPC contract change.

### Passed

- `pnpm typecheck`: strict TypeScript passed for shared photo-viewer ownership, targeted marker focus state, linked-evidence rendering and the expanded desktop coverage.
- `pnpm test`: all 29 database and foundation tests passed. Existing many-to-many link, cross-card rejection, cascade cleanup, lock, media, finalization, migration, serial and autosave coverage remains green.
- `pnpm build`: production main, preload and renderer bundles built successfully.
- `pnpm test:desktop`: all three Electron UI tests passed. The grading-workbench flow links one locked primary photo to two defects and one defect to both a primary and titled Additional photo; navigates from deep Photos content to the exact Inspection marker and Defect Map; verifies the existing selected-marker state and note panel; opens both linked photos in the shared viewer without leaving Inspection; closes with Escape and the visible control while retaining marker selection; then returns to the prior Photos scroll position. Existing image/View viewer, lock, replacement, removal, Rename, relaunch, card deletion and independent Library/Card Grading navigation flows remain covered.
- The linked-evidence screenshot was inspected at the 1050×760 test window. The selected marker remains visually obvious, linked-photo controls are compact and clearly actionable, slot/title labels are readable, and the Defect Map lands below the sticky grading header.
- `pnpm package`: a fresh unsigned macOS arm64 application was built under `release/mac-arm64`.
- `pnpm test:packaged`: all three Electron UI/relaunch tests passed against the fresh packaged application, including both evidence-navigation directions and full-resolution viewing from Inspection.
- `pnpm test:development`: the electron-vite development server and React renderer loaded/reloaded with trusted IPC.
- `git diff --check`: no whitespace errors.

There is no separate lint command/configuration; strict TypeScript includes unused-local and unused-parameter checking. Windows and Linux remain native CI/runtime verification items and were not executed locally for this milestone.

### Milestone 6 manual checks

1. Link several primary and Additional photos to one FRONT or BACK marker. Select that marker in Inspection and confirm every linked photo uses its slot, custom title, or original-filename fallback without showing an empty evidence area for unlinked markers.
2. Open linked unlocked and locked photos from Inspection. Close once with Escape and once with the visible control; confirm Inspection remains active and the same marker and note panel stay selected.
3. From deep in Additional Photos, activate each linked marker reference in turn. Confirm Inspection opens the exact marker, scrolls the Defect Map below the sticky header, and uses the existing selected-marker styling and details panel.
4. Return to Photos after targeted marker navigation and confirm the previous Photos scroll position is restored closely enough to keep the working area in context.
5. Link one photo to multiple markers and verify every marker reference targets the correct side, position and note. Unlink, delete a marker, and delete a photo in turn; confirm stale references never remain.
6. Review long filenames, long custom titles, many linked photos and many linked markers at typical MacBook window sizes for wrapping, scrolling, focus indication and keyboard accessibility.
7. Repeat the evidence navigation and packaged-photo checks on Windows and Linux through the native validation matrix.

## Milestone 5 catalogue sorting and laptop layout refinement

Observed on 2026-09-11, macOS arm64. No check used a real user library; automated Electron runs created disposable libraries and media. This milestone adds no database migration.

### Passed

- `pnpm typecheck`: strict TypeScript passed after removing the grading close action and consolidating the compact header markup.
- `pnpm test`: 29 tests passed. New catalogue coverage verifies descending fixed-width serial order across bounded pages, confirms editing an older card does not move it, and confirms a newly allocated higher serial enters at the correct position. All existing migration, serial, autosave, inspection and Photos tests remain green.
- `pnpm build`: production main, preload and renderer bundles built successfully.
- `pnpm test:desktop`: all three Electron UI tests passed. At a 1050×760 window, the suite verifies a compact header below 100 px, sticky positioning within one scroll container, two-column Corner/Edge grids, bounded 180–230 px empty preview surfaces, active identity, grading/save states, all three tabs, and removal of the legacy close control and duplicate grading breadcrumb. Existing image/View viewer, lock, replacement, removal, Rename and marker-link flows remain covered.
- The desktop navigation test verifies the first row is serial `0000000030` and remains there after editing card `0000000005`, alongside the existing independent Library preview/Card Grading restoration checks.
- `pnpm package`: a fresh unsigned macOS arm64 application was built under `release/mac-arm64`. The first sandboxed attempt could not reach the Electron release host; rerunning with the requested build access completed normally.
- `pnpm test:packaged`: all three Electron UI/relaunch tests passed against the fresh packaged application.
- `pnpm test:development`: the electron-vite development server and React renderer loaded/reloaded with trusted IPC.
- The generated Overview and Photos screenshots were inspected at their test window sizes. The compact header retains clear identity/state hierarchy, Full Card remains generous, and the main grading content begins materially higher than before.
- `git diff --check`: no whitespace errors.

There is no separate lint command/configuration; strict TypeScript includes unused-local and unused-parameter checking. Windows and Linux remain native CI/runtime verification items and were not executed locally for this milestone.

### Milestone 5 manual checks

1. Populate at least fifteen cards, edit several older cards, and confirm the default Library remains strictly serial-descending through navigation and relaunch.
2. At typical MacBook Air window sizes, review long and blank card names with In Progress, Finalized and changes-pending states. Confirm identity, grading status and save state remain legible without wrapping over the tabs.
3. Scroll long Overview, Inspection and Photos content and confirm the two-row header stays fixed without introducing a second scrollbar or hiding focused controls.
4. Populate all four Corner and all four Edge slots with portrait, landscape and microscope-style images. Confirm each group remains a 2×2 grid, its full photographs remain visible without cropping, and the group is practical to review in one viewport.
5. Confirm Full Card Front/Back previews still feel intentionally larger than Corner/Edge previews and retain the `Front and back` helper text.
6. Open every primary photo once by clicking the image and once through View, then exercise Lock/Unlock, Replace, Remove, Additional Rename and defect-marker linking to confirm layout changes did not alter behavior.
7. Repeat the responsive and packaged-photo checks on Windows and Linux through the native validation matrix.

## Milestone 4 navigation and Photos polish

Observed on 2026-09-11, macOS arm64. No check used a real user library; all profiles, catalogues and images were temporary. This milestone adds no database migration.

### Passed

- `pnpm typecheck`: strict TypeScript passed for the separate Library preview/active grading-card state, scroll restoration, rename mode and updated tests.
- `pnpm test`: 28 tests passed. Existing serial, migration, inspection, autosave, photo storage, lock, replacement, link, cleanup and finalization coverage remains green. Photo persistence coverage now also verifies title changes and blank-title removal leave the stored original filename and media path unchanged.
- `pnpm build`: production main, preload and renderer bundles built successfully.
- `pnpm test:development`: the electron-vite development server and React renderer loaded/reloaded with trusted IPC.
- `pnpm test:desktop`: three Electron UI tests passed. The new 30-card test starts with no active grading card, selects a deeply scrolled Library row, opens it explicitly, restores its Photos tab/scroll after previewing another card, restores the other Library selection/visibility, drains a pending metadata edit across workspace navigation, and changes the active card only after the second explicit Open card action.
- The Photos UI test verifies filename fallback without “Untitled photo,” Rename entry, Cancel, custom-title Save, original filename as secondary metadata, locked-photo rename, blank Save returning to filename fallback, image-surface viewer opening, visible View control opening, Escape/visible close, and all existing link/lock/replace/relaunch behavior.
- `pnpm package`: an unsigned macOS arm64 application was built successfully under `release/mac-arm64`.
- `pnpm test:packaged`: all three Electron UI/relaunch tests passed against the fresh packaged application.
- `git diff --check`: no whitespace errors.
- Screenshots of the full-width Overview, Photos workbench and a Library preview at a deep list position were inspected. The selected Library row stays visible, the preview remains pinned, the grading workspace uses the full main width, and the sticky grading identity/tab area does not create a second scroll region.

There is no separate lint command/configuration; strict TypeScript includes unused-local and unused-parameter checking. Windows and Linux remain native CI/runtime verification items and were not executed locally for this milestone.

### Milestone 4 manual checks

1. Open a card on Photos, scroll to Additional Photos, visit Library and Settings, preview unrelated cards, then return through Card grading. Confirm the original card, Photos tab and approximate Photos scroll position return.
2. Scroll several pages into a populated Library, select a row, leave and return. Confirm the same preview remains selected and its row is visible. Then select a different row and confirm the active grading card does not change until Open card is clicked.
3. Type in Overview, grading notes, marker notes and an Additional title, then immediately use each top-level destination and each card tab. Confirm saved values survive and no workspace change bypasses the save-error protection.
4. Review the sticky card identity/tabs while scrolling long Inspection and Photos content at typical MacBook and external-display sizes. Confirm it never obscures controls or introduces nested-scroll confusion.
5. Verify Library previews with and without a Front photo, long names, blank metadata, all workflow states and all grade combinations.
6. For Additional Photos, test Rename with Save, Cancel, Enter and Escape; save whitespace/blank to remove a title; and repeat while locked. Confirm the original filename/path and image remain unchanged.
7. Open a populated photo by clicking the image surface and by clicking View. Confirm both use the same viewer and Escape still closes it.
8. Relaunch and confirm the app intentionally starts in Card Library with Card grading showing its neutral no-active-card state until a card is explicitly opened.
9. Repeat navigation and responsive-layout checks in packaged Windows and Linux builds through the native CI/manual matrix.

## Milestone 3 Photos

Observed on 2026-09-10, macOS arm64. No check used a real user library; all profiles, catalogues and source images were temporary.

### Passed

- `pnpm typecheck`: strict TypeScript passed across shared Photo contracts, preload, IPC, database/media service, renderer and tests.
- `pnpm test`: 28 tests passed. Photo coverage verifies migration 4 from the corrected Milestone 2 schema, marker preservation, copied originals independent of source paths, thumbnail creation and missing-thumbnail regeneration, Additional title persistence/autosave, primary-slot uniqueness, lock persistence and locked mutation rejection, successful replacement, failed replacement preserving the working photo, normalized many-to-many marker links, database and service rejection of cross-card links, link cascades, path-traversal rejection, card database/media cleanup and no grading-revision/finalization effect.
- `pnpm build`: production main, preload and renderer bundles built successfully with Sharp externalized for packaged runtime use.
- `pnpm test:development`: the electron-vite development server and renderer loaded/reloaded with trusted IPC.
- `pnpm test:desktop`: both Electron UI tests passed against the production bundles. The grading-workbench test now imports real PNG and WebP images, renders primary and Additional thumbnails, links a marker, verifies lock controls, autosaves an Additional title across a tab change, opens the original viewer, replaces a primary image, confirms finalization remains current, then verifies photo persistence after close/relaunch and the existing card deletion/serial-retirement path.
- `pnpm package`: an unsigned macOS arm64 application was built under `release/mac-arm64`. Inspection confirmed the arm64 Sharp module and libvips dylib in `app.asar.unpacked`.
- `pnpm test:packaged`: both Electron UI/relaunch tests passed against that packaged production application, including actual PNG/WebP thumbnail decoding.
- `git diff --check`: no whitespace errors.
- The Photos workbench screenshot was visually inspected for the existing dark visual language, large Full Card tiles, inviting empty states, 2×2 Corners arrangement, readable controls and responsive grouping.

There is no separate lint command/configuration. Strict TypeScript includes unused-local and unused-parameter checking. Windows and Linux dependency installation, packaging and the same packaged photo-import test are configured in the native CI matrix, but those operating systems were not executed locally in this milestone.

### Milestone 3 manual checks

1. Import large portrait and landscape JPEG, PNG and WebP photographs through each native picker. Confirm Full Card thumbnails are largest, Corners stay in their spatial 2×2 positions, Edges remain clear, and a card with no photos looks intentionally empty.
2. Drag one image onto an empty primary slot, another onto an occupied unlocked slot, and several files onto Additional Photos. Verify replacement confirmation appears, multiple Additional files import, unsupported/non-image files fail cleanly, and the source files can be moved or deleted afterward.
3. Lock a primary and an Additional photo. Confirm both remain viewable, the Additional title and marker links remain editable, and replace/remove controls return only after explicit unlock.
4. Cancel photo removal once, then confirm it for an unlocked photo. Confirm its thumbnail disappears while its defect marker remains. Repeat replacement and verify the old photo is gone only after the new thumbnail is ready.
5. Open each thumbnail in the large viewer, including a very high-resolution image. Resize the window, verify aspect ratio and viewport fitting, then close with both the visible button and Escape.
6. Create several FRONT/BACK markers with notes, link multiple markers to one photo and one marker to multiple photos, and check the linked-photo count in Inspection. Delete a link, a marker and a photo in turn and verify only the expected owned links disappear.
7. Finalize a complete card, then add, title, link, lock, replace and remove photos. Confirm the status stays **Finalized** and never becomes changes pending from photo work.
8. Type an Additional title and immediately switch tabs, close the window, and use Command+Q. Relaunch after each path and confirm the title and other photo state persisted.
9. In a disposable library, add locked and unlocked photos and then confirm whole-card deletion. Confirm the media and thumbnail card folders are removed and a newly created card still skips the deleted card's permanently reserved serial.
10. Run the packaged application on Windows and Linux through the native CI/manual matrix and repeat a PNG/WebP import to verify their platform-specific Sharp binaries and native pickers.

## Milestone 2 grading-model correction

Observed on 2026-09-10, macOS arm64. No check used a real user library; all application profiles and catalogues were temporary.

### Passed

- `pnpm typecheck`: strict TypeScript passed across the corrected shared inspection types, migration, main-process persistence, renderer, and tests.
- `pnpm test`: 21 tests passed. New coverage confirms Centering-grade parsing/fixed display, persistence, finalization requirement, finalized-to-pending behavior after a Centering edit, defect-marker edits remaining non-invalidating, and migration from the Milestone 2 schema.
- The migration test starts with populated obsolete Defects grade/note fields, a real Centering note, a finalized assessment, and a defect marker. Migration 3 leaves Centering grade blank, preserves the Centering note and marker, removes both obsolete Defects columns from the active table, increments the assessment revision, and derives **Finalized — changes pending**.
- `pnpm build`: production main, preload, and renderer bundles built successfully.
- `pnpm test:desktop`: both Electron UI tests passed. The workbench test verifies the five corrected grade controls, a single Centering notes popover, Centering-grade invalidation/re-finalization, quit-time flush, relaunch persistence, marker persistence, and the existing delete/serial-retirement path.
- `pnpm package`: the corrected unsigned macOS arm64 ASAR application was built successfully.
- `pnpm test:packaged`: both Electron UI/relaunch tests passed against that production package.
- `pnpm test:development`: the development application rendered, reloaded, and retained trusted IPC behavior.
- `git diff --check`: no whitespace errors.

There is no separate lint command/configuration. Strict TypeScript includes unused-local and unused-parameter checking. Windows and Linux remain native CI/manual runtime verification items; they were not packaged or executed locally for this correction.

### Manual checks

1. Open an existing Milestone 2 library that contains a finalized card. Confirm it migrates cleanly, shows **Finalized — changes pending**, retains defect markers and the original Centering note, and starts with a blank Centering grade.
2. Confirm the grading row reads Centering, Corners, Edges, Surface, Estimated Grade and contains no Defects grade. Open the Centering note and verify there is no second Centering note beside Raw Measurements.
3. Enter `9` and `10` as Centering grades, blur the field, and verify `9.0` and `10.0`. Confirm Centering is required for finalization and is never derived from measurements.
4. Add, edit, and remove defect markers on a finalized card and verify finalization remains current. Then edit Centering grade and verify **Finalized — changes pending**.

## Milestone 2

Observed on 2026-09-10, macOS arm64. No check used a real user library; all application profiles and catalogues were temporary.

### Passed

- `pnpm typecheck`: strict TypeScript across main, preload, renderer, shared contracts, and tests.
- `pnpm test`: 20 tests passed. Coverage includes fixed-precision grade/measurement parsing, directional centering ratios, apparent-skew direction/neutral/contradiction handling, finalization validation and revision transitions, inspection/note/marker persistence, marker removal and normalized-coordinate constraints, Include on public site default/persistence, migration from schema 1, card-owned cascade deletion, serial tombstoning and attempted deleted-serial reuse, existing serial/allocation/migration guarantees, plus autosave edits made in either direction during an in-flight metadata or inspection save.
- `pnpm build`: production main, preload, and renderer bundles built successfully.
- `pnpm test:development`: the electron-vite development application rendered, reloaded, and retained trusted IPC behavior.
- `pnpm test:desktop`: both real Electron UI tests passed. The workbench test enters and formats all assessment values, saves notes and a normalized marker, finalizes, shows changes pending after a required edit, re-finalizes, quits through the Command+Q menu action with a metadata edit still inside the debounce interval, relaunches, verifies persistence, confirms deletion, and verifies the retired serial is skipped.
- `pnpm package`: an unsigned macOS arm64 ASAR application was built under `release/mac-arm64` using Electron 44.3.0 and the bundled SQLite runtime.
- `pnpm test:packaged`: both Electron UI/relaunch tests passed against the production packaged application.
- `git diff --check`: no whitespace errors.
- The generated Inspection workbench screenshot was visually inspected for grouping, fixed precision, calculated values, defect-map scaling, selected-marker editing, and finalization presentation.

There is no separate lint command/configuration. Strict TypeScript includes unused-local and unused-parameter checking.

### Verification limits

The existing native CI matrix is still the runtime packaging gate for Windows and Linux. Those packages were cross-built during Milestone 1, but were not rebuilt or executed locally for Milestone 2. Installer creation/install/uninstall, signing/notarization, and a custom application icon remain outside this local validation.

### Milestone 2 manual checks

1. On macOS, type into a field and immediately press Command+Q. Relaunch and verify the edit persisted. Also test Quit from the application menu and normal window close.
2. Enter temporary/invalid numeric text, then blur each grade and measurement. Verify invalid input remains clearly marked, valid grades display one decimal, valid measurements display two decimals with `mm`, and finalization identifies every missing/invalid required item.
3. Enter asymmetric centering values and confirm each Top/Bottom or Left/Right ratio preserves direction. Compare clockwise, counterclockwise, and contradictory sets against the clearly approximate skew label.
4. Add front/back markers near each edge, resize the window, and verify their positions remain attached to the same relative locations. Edit and remove marker notes, navigate between cards, and relaunch.
5. Finalize a complete card, edit a required assessment value, and confirm **Finalized — changes pending**. Verify that editing metadata, notes, markers, or Include on public site leaves finalization current. Finalize again and check the timestamp changes.
6. In a disposable library, cancel deletion once, then confirm it. Verify the card and its inspection/markers disappear. Move Next serial backward to the deleted value and create another card; the retired serial must be skipped.
7. Review the dark workbench at your usual display scaling and smaller window widths, including natural Tab/Shift+Tab form navigation and the deliberate delete/finalize controls.

## Milestone 1

Observed on 2026-09-10, macOS arm64. Development Node 24.19.0, pnpm 11.19.0, Electron 44.3.0. No tests used a real user library; all test libraries and installation profiles were temporary.

## Passed

- `pnpm typecheck`: strict TypeScript, including main/preload/renderer and tests.
- `pnpm test`: 11 tests covering serial formatting, UUID generation, local uniqueness, immutable identity, null metadata, saved data after database reopen, range history, range collision skipping, pointer validation, exhaustion at the 10-digit limit, distinct installations, stale-revision rejection, migration idempotence/future-version rejection/rollback, bounded pages, safe folder selection, insert failure rollback, ordered autosave and failed-save retry.
- `pnpm build`: production main, preload and React renderer builds. Packaged HTML retains strict CSP without `unsafe-inline`.
- `pnpm test:development`: actual electron-vite dev startup, React rendering/reload and trusted IPC on a temporary profile. Fixed development CSP for Vite's inline preamble/hot styles and normalized trusted URLs during this check.
- `pnpm test:desktop`: built app create/edit/close/relaunch smoke test passed during implementation.
- `pnpm package`: unsigned native macOS arm64 application created.
- `pnpm test:packaged`: final macOS ASAR-packaged application passed the real Electron UI test: create library, save allocation, create first card, edit all eleven metadata fields, immediately close after the final edit, relaunch, verify every field and permanent serial, create second card with blank metadata, verify serial continuation and workstation settings. Confirms bundled SQLite actually works inside the package and preload security settings remain enabled.
- `pnpm exec electron-builder --win --linux --dir --x64 --config.win.signAndEditExecutable=false`: Windows and Linux x64 unpacked packages created successfully on macOS. Correct PE/ELF binaries and ASAR application files inspected. Windows executable resource editing/signing was disabled only for this cross-build validation command; default Windows build configuration retains normal resource processing.
- UI screenshot inspected for the dark library list and metadata editor; saved metadata updates its list row.

## Verification limits

Windows/Linux packages were cross-built, not executed here. `.github/workflows/validate.yml` performs native packaging and packaged-app persistence tests on all three operating systems, with Xvfb on Linux. That workflow has not been run in this session. Windows/Linux runtime behavior remains a native CI/manual verification item. macOS Intel and Windows/Linux ARM are not tested in this milestone.

DMG/NSIS/AppImage/DEB installer targets are configured, but installer creation/install/uninstall flows were not exercised here. No signing/notarization credentials or custom application icon are configured. Local packages are unsigned and use Electron's default icon. There is no separate lint configuration; strict TypeScript includes unused-local/parameter checks.

## Manual checks in the running app

1. Start with `pnpm dev` or open the macOS app under `release/mac-arm64`. Create a library through the real native folder chooser, including Cancel and selection of a nonempty folder. Test a library path containing spaces/non-ASCII characters.
2. Historical Milestone 1 check: adjust the window size and try natural field tabbing, text selection, copy/paste and multiline notes. At that implementation state, Inspection and Photos remained disabled.
3. Create several incomplete cards; switch between them after typing and close/relaunch. Verify the last edits, blank fields and fixed 10-digit serials. Native close waits for saves; forced termination/power loss can still lose the unsaved debounce interval.
4. Change to a new allocation range; verify the old range is retired, prior cards retain their serials and new cards use the new range. Try zero, an occupied next serial, an out-of-range pointer and an exhausted range on a disposable library.
5. Open another library and reopen the original. Rename/move an entire library only while the app is closed; the next launch should report the missing location and permit explicit selection rather than replacing it.
6. On a disposable library, test unavailable/read-only storage and save retry. Failed saves must remain visibly unsaved and normal close/navigation must not discard the draft. Do not use your only copy for fault injection.

No later-milestone inspection, photos, public-site generation or archive/restore features were implemented.
