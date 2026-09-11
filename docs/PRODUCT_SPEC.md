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

Finalization requires all eight centering measurements, the four subgrades Centering, Corners, Edges and Surface, and the Estimated Grade: thirteen numeric values in total. Photos, identifying metadata and defect markers are NOT required.

Grades are manually typed numeric values, range 0.0–10.0, maximum one decimal place. Always display exactly one decimal (`10.0`, `9.5`, `8.0`). Centering, Corners, Edges and Surface each have one subgrade. Estimated Grade is manually entered, never automatically averaged from subgrades. There is no numeric Defects grade. Each grading field has a small notes icon opening a compact editable popover, with a visible note-present state. Notes autosave.

### Centering

The manually entered Centering grade is the user's judgment. It is not calculated from border measurements, ratios, or apparent skew. Its single general Centering note is attached to this grading field; the raw-measurement section has no second Centering note control.

Centering also uses exactly eight manually entered border measurements in millimeters, up to two decimal places. Display exactly two decimal places after entry (`2.00 mm`, `2.35 mm`, `1.80 mm`, never `2.5` for `2.50`). Four comparisons:

| Comparison | First | Second |
| --- | --- | --- |
| Vertical, left side | top-left | bottom-left |
| Vertical, right side | top-right | bottom-right |
| Horizontal, upper area | upper-left | upper-right |
| Horizontal, lower area | lower-left | lower-right |

Calculate each pair's centering ratio live from raw millimeter values. Raw measurements are authoritative; percentages are derived and shown with one decimal place. Display approximate apparent print skew and rotation direction/amount from measurement differences. Do not request exact physical measurement positions: approximation is deliberate for this hobby workflow. Empty, zero-total, temporarily invalid, incomplete, or contradictory values show a neutral unavailable result rather than `NaN`, infinity, or fabricated confidence.

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

Library settings provides app-wide **Update Public Site** and **Rebuild Entire Site…** operations. The user chooses a local output folder, possibly a Git repository, and the machine-local choice is remembered for that library. Update is the normal operation: it generates new and changed reports, reuses unchanged report pages and public image derivatives, repairs missing owned files, and removes output for cards that are no longer eligible. Rebuild is a confirmed secondary action that recreates every eligible report and image derivative. Generation includes all and only cards whose assessment is currently **Finalized** and whose **Include on public site** flag is enabled. In Progress, changes-pending, excluded, and deleted cards have no report or public media after either operation. Generation never creates a Published state and performs no Git, hosting, or network operation.

The result is self-contained static HTML/CSS/JS/data with a searchable **Card Reports** gallery and physical report pages at `cards/<10-digit serial>/index.html`. Relative links support both domain-root and arbitrary subdirectory hosting without rewrite rules, server runtime, SPA fallback, CDN, or host-specific dependency. The catalogue and search index use only serial, Card Name, Card Number, Game / Category, Set, Variant / Parallel, Estimated Grade, report URL, and optional front catalogue thumbnail. They remain serial-descending, numeric serial searches ignore leading zeros for exact-match ranking, and visible-result counts use correct singular/plural grammar.

The public privacy boundary is an explicit main-process allowlist. **Submitted by** and **General Notes** never enter the generator model or any generated HTML, JSON, JavaScript, metadata, or search data. Optional blank public metadata and empty grading-note sections are omitted. Public reports include fixed-precision grades, Centering/Corners/Edges/Surface notes when present, ratios, raw measurements, apparent skew, normalized defect maps and notes, all primary photo slots, and evidence relationships. Missing primary photos use intentional placeholders. Additional Photos are copied only when linked to at least one defect; unlinked Additional Photos remain entirely absent. One linked photo may be referenced by multiple defects without creating duplicate public media files.

For a Front photo, the public catalogue gets a dedicated 420-pixel-bound WebP thumbnail at quality 78. Every published photo also gets the established 900-pixel-bound report preview (quality 82) and 2400-pixel-bound lightbox image (quality 90). Sharp applies orientation, preserves aspect ratio and never enlarges a source. Catalogue thumbnails use native lazy loading and sit inside the same bounded 4:3 neutral media region as photo-less placeholders, keeping every responsive gallery tile structurally aligned without loading report or lightbox assets. Generated report pages preserve the prominent report-number heading and present Card Name as a strong second-level identity. Pages use semantic controls, visible focus treatment, responsive layouts, a lightweight defect selector, and an Escape-capable native dialog lightbox. User text is escaped into HTML and is never injected through `innerHTML`.

The generator stages new and changed output beside the destination. `.cards-under-glass-site.json` remains format version 1 for ownership compatibility and records every generator-owned relative file. Its incremental generation state version 1 records each report's public fingerprint, report/image format versions, generated files, and each public photo's content fingerprint and derivative files. The deterministic fingerprint uses only data that can affect public output. Original photo bytes are streamed through SHA-256; private Submitted by and General Notes values are neither fingerprinted nor stored. Small global catalogue, search, CSS and JavaScript files are refreshed on every run.

A successful commit replaces staged owned files, leaves verified unchanged owned files untouched, and drops stale owned reports/media while preserving `.git`, `CNAME`, workflows, README files, and all other unknown content. Missing derivative files are regenerated individually even when the card fingerprint still matches. An unknown file that conflicts with a planned generated path stops the build. Unsafe/symlinked owned paths are rejected. Failure before or during commit preserves the previous working generated site where practical. Sites made by the earlier format-1 generator remain valid; their first Update safely regenerates eligible reports and establishes incremental metadata. `.nojekyll` is generated as a harmless compatibility file. The local catalogue remains the source of truth and generated output is disposable.

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

**Update Public Site** is the default workflow. It compares a deterministic public-only card fingerprint and per-photo SHA-256 content identities with versioned state in the generated ownership manifest. New or changed cards are regenerated, missing derivatives are repaired, ineligible cards and their media are removed, and unchanged report pages and images retain their existing files. Compact global catalogue/search/shared assets still refresh from the complete eligible set. **Rebuild Entire Site…** is a confirmed secondary action that bypasses this reuse and recreates all generator-owned output while retaining the same unknown-file protections. Existing pre-incremental manifests upgrade on their first Update. No database migration, private-field fingerprinting, Git, deployment, or hosting feature is added.
