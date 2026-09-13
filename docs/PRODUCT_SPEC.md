# Cards Under Glass — product specification

## Purpose and scope

A cross-platform desktop application for locally cataloguing and manually pre-grading collectible cards: Pokémon, One Piece, Magic: The Gathering, sports and similar cards. Personal hobby use, not an enterprise grading platform. Priorities: pleasant workflow, data safety, simplicity, modern UI, local-first operation and room to grow without needless complexity.

Electron, TypeScript, React, Vite, SQLite and local filesystem media. No runtime server or network service. User chooses the library folder. It holds the catalogue database, original media, generated thumbnails and relevant library files. Thumbnails are disposable and reconstructable from originals. Schema migrations are required from the start. Main process owns all database/filesystem operations behind secure typed IPC/preload, with context isolation enabled and renderer Node integration disabled.

## Identity and serial allocation

Every card immediately receives an invisible internal UUID and permanent human serial when created. Serial is exactly 10 zero-padded digits: `0000000001`, `0000000142`, `0000050137`. `0000000000` is reserved/invalid. Assigned serials NEVER change.

Each installation has an internal UUID and editable workstation/install name. Installations receive manually configurable serial ranges, normally 50,000 numbers each. Example A: `0000000001`–`0000050000`; B: `0000050001`–`0000100000`. Settings/setup allow a validated next-serial pointer within the active range. Retain historical/retired ranges. Allocation changes affect future cards only. Every assigned serial remains permanently reserved, including after card deletion, and can never be issued again. There is no cross-device allocation authority; users coordinate ranges manually.

## Metadata and workflow

All manually entered metadata is optional:

- Game / Category
- Set
- Card Name
- Card Number
- Year
- Language
- Variant / Parallel
- Rarity
- Manufacturer / Publisher
- Submitted by
- General Notes

Submitted by is private free text, not a reference to any person/customer directory. It must NEVER appear in public exports. There are NO tags. Blank values remain null/blank in storage. UI fallback text such as “Unnamed Card” is permitted only for display.

Cards can remain incomplete indefinitely. Multiple cards may be In Progress simultaneously. Metadata autosaves. Eventually provide **New Card Using Current Metadata** to carry useful shared identification fields into a new card, without copying grading, measurements, defects, photos or other inspection results. The precise copied field selection will be decided with that milestone.

Use deliberate UI interaction for changing/creating/deleting cards, finalizing, generating public output and allocation changes. Do not add single-key or convenience shortcuts that change workflow. Natural field tabbing and normal text editing are welcome.

## Grading and inspection

Normal grading states: **In Progress**, **Finalized**. Finalized means the user considers grading complete; it is not an irreversible lock. Finalized cards remain editable. Changes to a required grade or centering measurement show **Finalized — changes pending** until the user explicitly finalizes again. Editing metadata, assessment notes, defect markers, or Include on public site does not invalidate finalization because none changes the required grading assessment itself. Finalization records a timestamp.

Finalization requires all eight Front and eight Back centering measurements, the four subgrades Centering, Corners, Edges and Surface, and the Estimated Grade: twenty-one numeric values in total. Photos, identifying metadata and defect markers are NOT required.

Grades are manually typed numeric values, range 0.0–10.0, maximum one decimal place. Always display exactly one decimal (`10.0`, `9.5`, `8.0`). Centering, Corners, Edges and Surface each have one subgrade. Estimated Grade is manually entered, never automatically averaged from subgrades. There is no numeric Defects grade. Each grading field has a small notes icon opening a compact editable popover, with a visible note-present state. Notes autosave.

### Centering

The manually entered Centering grade is the user's judgment. It is not calculated from border measurements, ratios, or apparent skew. Its single general Centering note is attached to this grading field; the raw-measurement section has no second Centering note control.

Centering is supported by separate Front and Back sets of eight manually entered border measurements: sixteen raw measurements in total. There is still only one Centering grade and one general Centering note. The **Centering Front** and **Centering Back** groups are vertically stacked within one measurement section, with a restrained divider. Each measurement label has a subtle card-outline/double-headed-distance-arrow SVG helper, reused for both faces; text labels remain authoritative. Measurements use millimeters, up to two decimal places. Display exactly two decimal places after entry (`2.00 mm`, `2.35 mm`, `1.80 mm`, never `2.5` for `2.50`). Four comparisons:

| Comparison | First | Second |
| --- | --- | --- |
| Vertical, left side | top-left | bottom-left |
| Vertical, right side | top-right | bottom-right |
| Horizontal, upper area | upper-left | upper-right |
| Horizontal, lower area | lower-left | lower-right |

Calculate each pair's centering ratio independently for each face, live from its raw millimeter values: eight ratios total, four per face. Raw measurements are authoritative; percentages are derived and shown with one decimal place. Display independent Front and Back approximate apparent print skew and rotation direction/amount from each face's measurement differences. Do not request exact physical measurement positions: approximation is deliberate for this hobby workflow. Empty, zero-total, temporarily invalid, incomplete, or contradictory values show a neutral unavailable result rather than `NaN`, infinity, or fabricated confidence.

Existing single-face values migrate only to Front; Back starts null. Previously finalized cards retain their finalization timestamp/revision history but show **Finalized — changes pending** until Back is completed and the card is finalized again. There is no legacy local-card exception.

On each Inspection face, the existing four measurement panels show Top Left/Top Right beside Upper Left/Upper Right, then Bottom Left/Bottom Right beside Lower Left/Lower Right. Native Tab order follows Top Left, Top Right, Bottom Left, Bottom Right, Upper Left, Upper Right, Lower Left, Lower Right. Narrow layouts stack Top, Bottom, Upper, Lower in that same focus order. Ratios retain their original directional measurement pairs and explicit comparison labels.

### Defect markers

Simple card-shaped FRONT and BACK diagrams. Clicking creates a numbered marker at an approximate position. Markers can be selected, annotated, and removed; changes autosave. Store unique ID, card reference, front/back, normalized X/Y and optional free-text note. No mandatory taxonomy of type/category/severity. Zero markers is valid regardless of the Surface grade; these are supporting evidence, not finalization requirements. A marker can optionally link to one or more photos from the same card.

When a selected marker has linked photos, its existing detail panel shows compact labeled thumbnail controls. Primary evidence uses the slot label; Additional evidence uses its custom title or original filename fallback. Activating one opens the shared full-resolution viewer directly over Inspection. Closing with Escape or the visible control leaves Inspection active with the same marker selected. No linked-photo section appears when the marker has no photo evidence, and photo locks never restrict evidence viewing.

## Card deletion and standard application commands

The Overview has an intentional **Delete card…** action followed by clear permanent-action confirmation. Deletion cascades to card-owned inspection data, notes, defect markers, photos and photo-marker links. It also removes the card's application-owned original and thumbnail files regardless of photo lock state. A separate permanent reservation remains for every serial ever assigned, so a deleted card's serial can never be issued again even if an allocation pointer is moved backward.

Standard operating-system commands remain available. On macOS, Command+Q quits Cards Under Glass through the same protected save flush as closing the window. Standard text editing shortcuts remain. There are no custom shortcuts for creating, switching, deleting, or finalizing cards or changing allocations.

## Public-site eligibility

Every card exposes **Include on public site**, default true. It is editable and persists. It does not affect grading or finalization. Public generation requires both a current Finalized assessment and this flag enabled; the flag does not create a Published state or imply that generated files were hosted.

## Photos

Optional photos with at most ONE primary photograph per slot:

- Full card: Front, Back.
- Corners: spatial 2×2 arrangement, Top Left / Top Right above Bottom Left / Bottom Right.
- Edges: Top, Right, Bottom, Left. Spatial vs simpler grid layout is deferred.
- Additional Photos: separate unlimited gallery; each photo may have an optional title.

Photos are optional and never affect finalization. The card Photos tab provides deliberately grouped Full Card, Corners, Edges and Additional Photos areas. Native pickers and drag/drop accept JPEG, PNG and WebP. All native card-photo pickers share the last successfully imported photo's source directory across application restarts, using it as the next native dialog's initial directory while it remains available. Cancel, failed selection/import and drag/drop do not change this machine-local convenience setting; a missing directory quietly falls back to the operating system's normal picker location. Primary slots accept one image; an occupied unlocked slot requires clear replacement confirmation. Additional import accepts multiple images and optional free-text titles; blank titles remain null. No ordering UI, required category, tag, description or photo taxonomy is introduced. Full Card keeps “Front and back” helper text; Edges keeps “Top, right, bottom, left.” Corner orientation labels remain, without developer-like layout commentary.

Imports copy the unchanged original into the library and generate a separate, rebuildable thumbnail. Ordinary grids lazy-load only thumbnails. Clicking a thumbnail opens the original in a large aspect-preserving viewer with visible and Escape close controls. Missing thumbnails may be rebuilt from their original. Source files outside the library are never needed after a successful import.

Any photograph can optionally link to any number of defect markers belonging to the same card, and each marker can link to multiple photos. Links are supporting evidence and never change assessment revisions. Photo lock/unlock is an accidental-change safeguard only. Unlocked photos allow view/remove/replace. Locked photos allow view, title editing, marker linking and unlocking, but prevent photo removal/replacement. Locking does not create history and never prevents confirmed whole-card deletion. Removal is confirmed and permanent; successful replacement may delete the superseded original and thumbnail after the new photo is safely persisted.

Marker references in a photo's linking panel are explicit interactive controls alongside their independent link checkbox. Activating a marker keeps the active card, preserves the Photos tab scroll, switches to Inspection, selects that exact marker through the existing selected-marker state, and scrolls the Defect Map/details into view. Returning to Photos restores its prior scroll position. No second marker highlight or details UI is introduced.

Linked-marker disclosures are session UI state scoped to the active grading card. Any number may remain expanded at once. Leaving Photos and returning restores the same expanded disclosures with the existing Photos scroll position, providing a visual anchor after inspecting a marker. Removed photos are pruned from this state. Expansion is not catalogue data and resets on application restart or when another grading card is opened.

An Additional Photo normally displays a custom title prominently and its original filename as secondary metadata. Without a custom title, the original filename is the prominent display name; never display or persist a generic “Untitled photo” fallback. Rename is deliberate temporary editing with Save and Cancel. Its input starts with the existing custom title or blank when none exists. Enter may save and Escape may cancel. Saving blank clears the custom title. Renaming never changes the application-owned filename/path and remains available while the photo is locked. Both the image and a visible View control open the full-resolution viewer.

Full Card Front/Back previews remain deliberately generous. Corner and Edge groups remain spatial 2×2 grids, but their image/empty-slot preview surfaces use bounded responsive heights so increasing window width cannot make each row excessively tall. Images fit without cropping. This targets practical laptop use while retaining every orientation label, image-click viewing and the visible View affordance.

## Application workspaces and navigation

The permanent sidebar contains **Card library**, **Card grading**, and **Library settings**. Card Library uses the main area for the bounded list and a read-only selected-card preview. The preview may show the front thumbnail or intentional placeholder, permanent identity, useful metadata, workflow status, and five grades. Selecting a Library row never edits or opens it. A deliberate **Open card** action makes that card the active Card Grading card and navigates there.

Library preview selection and the active Card Grading card are independent. Browsing any number of Library rows must never change the grading card. Card Grading occupies the full main width and contains Overview, Inspection and Photos with persistent card identity. Its compact sticky header uses one row for serial, card name, grading status and save state, followed by one row of tabs. It does not repeat the application workspace breadcrumb or provide the legacy split-panel close action. With no active card, it shows a neutral direction to Card Library and never chooses a card automatically. New Card retains its established behavior: deliberate creation makes the new card active in Card Grading.

Within a running application, preserve Library selection, page, scroll position and selected-row visibility across workspace navigation. Preserve the active grading card, active card tab, and a separate scroll position for Overview, Inspection and Photos. All workspace and tab changes drain autosave first. Full application restart intentionally returns to Card Library with no active grading card; persisted catalogue data remains unchanged, and the user must explicitly open a card again. This avoids retaining an unscoped/stale active-card pointer when libraries can change.

## Library/dashboard (foundation and future)

Dense LIST is the default, ordered by permanent 10-digit serial descending. New higher serials therefore enter at the top while editing an older card never changes its catalogue position. `updatedAt` remains available for display and a possible future Recently edited view, but does not drive the default order. Future optional Gallery/Thumbnail view. Scale to thousands or more using virtualization/lazy loading and bounded queries rather than rendering the full collection. Useful list fields: serial, card name, Game / Category, Set, estimated grade, grading status, updated date. Avoid an enormous table of all metadata.

Future search covers serial, Card Name, Card Number, Game / Category, Set, Submitted by, Variant / Parallel and General Notes. Exact/near serial searches rank highly. A small Continue Working/recently edited area for In Progress cards may be useful later.

## Public static website

Library settings provides app-wide **Update Public Site** and **Rebuild Public Site…** operations. The user chooses a local output folder, possibly one synchronized by an external tool, and the machine-local choice is remembered for that library. Multiple independent libraries may publish into the same destination. They do not synchronize catalogue data: each library controls only the public reports it published, while reports published by other or unavailable libraries remain intact. Generation never creates a Published state and performs no synchronization, Git, hosting, or network operation.

Update is the normal operation. For the active library it publishes newly eligible reports, updates changed reports, reuses unchanged report pages and image derivatives, repairs missing local-owned derivatives, and removes its reports when cards become ineligible. Eligibility remains current **Finalized** plus **Include on public site**. A report from another library is preserved even when its serial does not exist locally. Attempting to publish a serial already owned by another library fails before any output is changed and directs the user to check allocation ranges.

Current reports show stacked Centering Front and Centering Back measurements/ratios/skew with one Centering subgrade. New snapshots use snapshot format 2/public schema 2 and require both faces. Legacy format-1/schema-1 snapshots explicitly retain their original measurements as Front and show that Back was not recorded; foreign/orphaned published reports remain rebuildable without invented data. Update removes locally owned reports whose migrated source cards are now changes-pending, while preserving foreign legacy reports.

After Centering, individual reports show Corners, then Edges, then the complete Defect Map with its notes and linked evidence. Existing optional Grading Notes remain afterward; section styling and interactions are unchanged.

Every report has a public-only snapshot at `data/cards/<10-digit serial>.json`. The snapshot is the durable published representation used to reconstruct the report and combined catalogue. It contains report metadata, grading, centering, defects, public photo roles/paths/content identities and evidence relationships, plus an opaque ownership key derived from the library's permanent UUID. It contains no raw library UUID, installation/workstation identity, card or marker UUID, local path, private field, or unlinked Additional Photo. Restoring a `.cug` archive preserves the library UUID and therefore automatically preserves publication ownership even when the replacement installation identity or serial range differs.

Rebuild is a confirmed secondary action that re-renders every valid published snapshot, regardless of its originating library, with the current report template and rebuilds global catalogue/search/shared output. It reuses existing public image derivatives because foreign or orphaned reports may no longer have source originals. A report remains valid when its source library no longer exists. External synchronization should occur before Update and again afterward; if separately changed destinations produce stale aggregate files, merge/synchronize the independent per-card snapshots/media and rerun Update to reconstruct the catalogue. Concurrent stale-copy publishing cannot be coordinated by this local application.

The result is self-contained static HTML/CSS/JS/data with a searchable **Card Reports** gallery and physical report pages at `cards/<10-digit serial>/index.html`. Relative links support both domain-root and arbitrary subdirectory hosting without rewrite rules, server runtime, SPA fallback, CDN, or host-specific dependency. The catalogue and search index use only serial, Card Name, Card Number, Game / Category, Set, Variant / Parallel, Estimated Grade, report URL, and optional front catalogue thumbnail. They remain serial-descending, numeric serial searches ignore leading zeros for exact-match ranking, and visible-result counts use correct singular/plural grammar.

The public privacy boundary is an explicit main-process allowlist. **Submitted by** and **General Notes** never enter the generator model or any generated HTML, JSON, JavaScript, metadata, or search data. Optional blank public metadata and empty grading-note sections are omitted. Public reports include fixed-precision grades, Centering/Corners/Edges/Surface notes when present, ratios, raw measurements, apparent skew, normalized defect maps and notes, all primary photo slots, and evidence relationships. Missing primary photos use intentional placeholders. Additional Photos are copied only when linked to at least one defect; unlinked Additional Photos remain entirely absent. One linked photo may be referenced by multiple defects without creating duplicate public media files.

For a Front photo, the public catalogue gets a dedicated 420-pixel-bound WebP thumbnail at quality 78. Every published photo also gets the established 900-pixel-bound report preview (quality 82) and 2400-pixel-bound lightbox image (quality 90). Sharp applies orientation, preserves aspect ratio and never enlarges a source. Catalogue thumbnails use native lazy loading and sit inside the same bounded 4:3 neutral media region as photo-less placeholders, keeping every responsive gallery tile structurally aligned without loading report or lightbox assets. Generated report pages preserve the prominent report-number heading and present Card Name as a strong second-level identity. Pages use semantic controls, visible focus treatment, responsive layouts, a lightweight defect selector, and an Escape-capable native dialog lightbox. User text is escaped into HTML and is never injected through `innerHTML`.

The generator stages new and changed output beside the destination. `.cards-under-glass-site.json` format version 2 owns only reproducible global files and records global report/image format versions. Per-card ownership, public fingerprints, photo SHA-256 identities, public derivative paths and per-card generation versions live in independently mergeable snapshots. The deterministic fingerprint uses only data that can affect public output. Private Submitted by and General Notes values are neither fingerprinted nor stored. Small global catalogue, search, CSS and JavaScript files are refreshed from the complete snapshot union on every run.

A successful commit replaces staged owned files, leaves verified unchanged files untouched, and drops only stale reports/media whose snapshot owner matches the active library, while preserving `.git`, `CNAME`, workflows, README files, foreign reports and all other unknown content. Missing local-owned derivatives are regenerated individually. Foreign derivatives are retained because this installation may not have their originals. An unknown file that conflicts with a planned generated path stops the build. Unsafe/symlinked ownership and snapshot paths are rejected. Failure before or during commit preserves the previous working generated site where practical. Sites made by the format-1 single-library generator migrate automatically when legacy report serials can be matched to this library's permanent reservation ledger; unattributable report files are preserved with a non-destructive warning. `.nojekyll` remains a harmless compatibility file.

## Manual Library Archive and Restore

Library settings provides deliberate **Create Library Archive…** and **Restore Library Archive…** actions with native file/folder dialogs. Backups are manual. A `.cug` file is an ordinary ZIP archive with explicit format version 1, a machine-readable manifest, a consistent SQLite catalogue snapshot, and every original photo owned by the catalogue. It contains complete private library data, including Submitted by, notes, grading, markers, photos, links, library identity, installation settings, allocation history, and deleted-card serial reservations. Public-site privacy filtering does not apply to this private backup.

The archive excludes generated thumbnails, caches, logs, application files, and unrelated `.cug` files. Every database and original-media payload has a recorded byte size and SHA-256 checksum. Archive creation first drains pending saves, temporarily blocks library mutations, verifies that every database photo record has its original, and writes a staged output that becomes the requested file only after completion. Normal close/Command+Q waits for an active archive operation to finish. A failure leaves the working library and any previous destination archive intact.

Restore validates the ZIP, manifest/version, declared entries, checksums, SQLite integrity and relationships, schema compatibility, library/install identity, photo references, and safe relative paths. It never merges into or overwrites a populated library. Extraction uses a sibling staging folder and becomes the chosen new/empty destination only after complete verification. The current library remains active until that commit and the restored catalogue opens successfully.

Restore preserves the originating installation UUID, workstation name, active/historical allocation ranges, next pointer, library UUID, and permanent serial tombstones so numbering continues exactly from the backup. The restored library is then opened as the active library. This is intentionally a replacement/recovery workflow: continuing to edit both old and restored copies can allocate overlapping future serials and is unsupported. Thumbnails are absent initially and regenerate lazily from authoritative restored originals. Format-version or database-schema versions newer than the application understands fail safely; compatible older schema snapshots use normal forward migrations when opened.

## Explicit v1 non-goals

Cloud sync; multi-computer live synchronization; merging independently edited card versions; automatic backups; submitter/customer directory; tags; grading-service APIs; automatic card identification; camera/tether integration; watched camera folders; automatic GitHub/Git operations; user accounts/authentication; remote database/backend; sophisticated grading statistics; multiple photos per primary slot; mandatory photos; irreversible finalization.

## UI direction

Modern, polished, desktop-native feeling. Default/primary dark mode. Clean spacing, generous but efficient layout, restrained hierarchy and good typography. Enthusiast tool, not enterprise administration or a generic Bootstrap dashboard. Accuracy and deliberate actions matter more than extreme keyboard speed.

## Milestone 1 — implementation boundary

Implement only: Electron/React/TypeScript tooling; secure main/preload/renderer boundary; SQLite with migrations; first-launch library selection/creation and folder structure; installation identity and configurable serial allocation; new card with UUID/permanent serial; basic bounded library list; opening/editing every metadata field; reliable autosave; persistence after close/relaunch; polished initial dark UI; automated serial, uniqueness, immutability, migrations and persistence tests; working dev/typecheck/test/build/package validation scripts.

Disabled Inspection/Photos placeholders are fine. Do not implement grading, centering, defects, media management, export or archive/restore in this milestone. Public-inclusion default and grading-state defaults may be persisted now without implementing their larger workflows.

## Milestone 2 — implemented boundary

Milestone 2 adds the card-level Overview/Inspection workbench, fixed-precision grade and centering entry, derived directional ratios and apparent skew, optional grading notes, normalized front/back defect markers, editable public-site eligibility, reversible finalization with a changes-pending state, deliberate confirmed card deletion, and standard OS quit behavior through the protected autosave flush. Its corrected grading row is Centering, Corners, Edges, Surface, and Estimated Grade; defects exist only as optional marker evidence. It also adds a permanent serial-reservation ledger so deleted-card serials can never be issued again.

Photos and photo-to-marker links, public-site generation, archive/restore, synchronization, automatic identification, and all other later systems remain outside this milestone.

## Milestone 3 — implemented boundary

Milestone 3 enables the Photos tab with fixed primary slots, unlimited Additional Photos, optional autosaved Additional titles, native picker and drag/drop import, separate generated thumbnails, lazy grid loading, and full-resolution modal viewing. It adds deliberate confirmed replacement/removal, persisted accidental-change locks, same-card many-to-many defect-marker links, and card-deletion media cleanup. Originals are copied into the selected library and are never modified during normal viewing. Photo operations do not invalidate grading finalization.

Public-site generation, archive/restore, synchronization, camera/tether integration, watched folders, image editing, RAW processing, gallery ordering and all other later systems remain outside this milestone.

## Milestone 4 — navigation and Photos polish boundary

Milestone 4 separates Card Library browsing from full-width Card Grading. It adds a read-only Library preview and explicit Open card action, independent preview/active-card identities, persistent in-app Library selection/scroll, persistent grading card/tab/per-tab scroll, a sticky grading identity/tab header, and a no-active-card state. It also replaces permanently visible Additional title inputs with explicit Rename/Save/Cancel, filename fallback, separate image/View viewer controls, and wider responsive photo layouts. No schema migration is required.

Library archive/restore, public-site generation, synchronization, Gallery view, grading statistics, New Card Using Current Metadata and other later systems remain outside this milestone.

## Milestone 5 — catalogue sorting and laptop layout refinement

Milestone 5 changes the default bounded Card Library query from update-recency to permanent serial descending. It compacts the Card Grading chrome into a sticky two-row identity/status/save/tab header, removes the redundant grading breadcrumb and legacy close control, and bounds Corner/Edge preview heights while retaining their 2×2 grids. Full Card previews and all established photo interactions remain unchanged. No schema migration is required.

Archive/restore, public-site generation, synchronization, Gallery view, grading statistics and other later systems remain outside this milestone.

## Milestone 6 — navigable defect/photo evidence

Milestone 6 makes existing many-to-many evidence links navigable. A selected Inspection marker exposes its linked photos and opens the existing viewer without changing tabs. Photo marker references deliberately target the existing Inspection marker selection and Defect Map, while preserving per-tab scroll and the active card. Lock semantics and all persisted relationship behavior remain unchanged. No schema migration is required.

Archive/restore, public-site generation, synchronization, Gallery view, grading statistics and other later systems remain outside this milestone.

## Milestone 7 — manual Library Archive and Restore

Implemented complete private `.cug`/ZIP backups and defensive restore into a separate new/empty folder. The archive uses an explicit manifest and SHA-256 integrity records, a consistent SQLite online-backup snapshot, all originals, and no thumbnail cache. Restore preserves library/installation/allocation/serial-reservation state, validates and stages before commit, opens the restored library only after success, and regenerates thumbnails lazily. No merge, synchronization, automatic backup, public export, or Git behavior is included.

## Milestone 8 — Public Static Site Generator

Implemented a deliberate Library-settings generator for portable static card reports. Eligibility requires a current finalized assessment and the card-level public flag. The output uses serial URLs, relative assets, static search, responsive report pages, WebP preview/lightbox derivatives, primary-slot placeholders, normalized defect maps and defect-linked evidence. A strict allowlist excludes Submitted by, General Notes and unlinked Additional Photos. Versioned ownership metadata supports stale cleanup without deleting user-managed output-folder content. No schema migration, Git behavior, deployment, account, server, or synchronization feature is added.

## Milestone 9 — public catalogue and report polish

The public home remains a responsive visual gallery, now headed **Card Reports** with correct result-count grammar. Every tile uses the same bounded 4:3 media structure, whether it contains a Front photo or an intentional placeholder. Front photos receive a dedicated lazy-loaded 420-pixel catalogue derivative; 900-pixel report previews and 2400-pixel lightbox images remain report-only. Report Card Name is promoted to a strong semantic subheading beneath the unchanged report-number identity. Catalogue derivatives participate in the existing owned-file stale cleanup. No schema migration or new public data field is added.

## Milestone 10 — incremental Public Site generation

**Update Public Site** is the default workflow. It compares a deterministic public-only card fingerprint and per-photo SHA-256 content identities with versioned generated state. New or changed cards are regenerated, missing derivatives are repaired, ineligible cards and their media are removed, and unchanged report pages and images retain their existing files. Compact global catalogue/search/shared assets refresh from the complete published snapshot set. Existing pre-incremental manifests upgrade on their first Update. No database migration, private-field fingerprinting, Git, deployment, or hosting feature is added.

## Milestone 11 — multi-library Public Site publishing

One static destination may now contain independently owned reports from several unsynchronized libraries. Each `data/cards/<serial>.json` public snapshot carries a stable opaque owner derived from the immutable library UUID and enough allowlisted data to rebuild its report. Update modifies/removes only the active library's reports, preserves foreign/orphaned content, preflights serial collisions, and reconstructs global catalogue/search from all valid snapshots. **Rebuild Public Site…** re-renders every snapshot while reusing existing public images when originals are unavailable. Format-1 sites migrate conservatively, restored libraries regain ownership automatically, and externally merged snapshots repair stale aggregate files on the next Update.
