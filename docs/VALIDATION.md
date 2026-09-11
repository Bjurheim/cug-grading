# Validation history

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
