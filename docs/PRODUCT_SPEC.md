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

## Card deletion and standard application commands

The Overview has an intentional **Delete card…** action followed by clear permanent-action confirmation. Deletion cascades to card-owned inspection data, notes, defect markers, photos and photo-marker links. It also removes the card's application-owned original and thumbnail files regardless of photo lock state. A separate permanent reservation remains for every serial ever assigned, so a deleted card's serial can never be issued again even if an allocation pointer is moved backward.

Standard operating-system commands remain available. On macOS, Command+Q quits Cards Under Glass through the same protected save flush as closing the window. Standard text editing shortcuts remain. There are no custom shortcuts for creating, switching, deleting, or finalizing cards or changing allocations.

## Public-site eligibility

Every card exposes **Include on public site**, default true. It is editable and persists, but performs no generation or publishing in this milestone. It does not affect grading or finalization. Future generation still requires both Finalized and this flag enabled.

## Photos

Optional photos with at most ONE primary photograph per slot:

- Full card: Front, Back.
- Corners: spatial 2×2 arrangement, Top Left / Top Right above Bottom Left / Bottom Right.
- Edges: Top, Right, Bottom, Left. Spatial vs simpler grid layout is deferred.
- Additional Photos: separate unlimited gallery; each photo may have an optional title.

Photos are optional and never affect finalization. The card Photos tab provides deliberately grouped Full Card, Corners, Edges and Additional Photos areas. Native pickers and drag/drop accept JPEG, PNG and WebP. Primary slots accept one image; an occupied unlocked slot requires clear replacement confirmation. Additional import accepts multiple images and optional free-text titles; blank titles remain null. No ordering UI, required category, tag, description or photo taxonomy is introduced.

Imports copy the unchanged original into the library and generate a separate, rebuildable thumbnail. Ordinary grids lazy-load only thumbnails. Clicking a thumbnail opens the original in a large aspect-preserving viewer with visible and Escape close controls. Missing thumbnails may be rebuilt from their original. Source files outside the library are never needed after a successful import.

Any photograph can optionally link to any number of defect markers belonging to the same card, and each marker can link to multiple photos. Links are supporting evidence and never change assessment revisions. Photo lock/unlock is an accidental-change safeguard only. Unlocked photos allow view/remove/replace. Locked photos allow view, title editing, marker linking and unlocking, but prevent photo removal/replacement. Locking does not create history and never prevents confirmed whole-card deletion. Removal is confirmed and permanent; successful replacement may delete the superseded original and thumbnail after the new photo is safely persisted.

## Library/dashboard (foundation and future)

Dense LIST is the default. Future optional Gallery/Thumbnail view. Scale to thousands or more using virtualization/lazy loading and bounded queries rather than rendering the full collection. Useful list fields: serial, card name, Game / Category, Set, estimated grade, grading status, updated date. Avoid an enormous table of all metadata.

Future search covers serial, Card Name, Card Number, Game / Category, Set, Submitted by, Variant / Parallel and General Notes. Exact/near serial searches rank highly. A small Continue Working/recently edited area for In Progress cards may be useful later.

## Public static website (future, not first milestone)

App-wide **Generate Public Site** operation. User chooses local output folder, possibly a Git repository. Generate all and only cards that are BOTH Finalized AND Include on public site enabled. Every card has a boolean Include on public site, default true, affecting only generated output.

Generate complete static HTML/CSS/JS/data with a searchable main page and individual card pages, suitable for GitHub Pages. Deterministic complete rebuild; removed or excluded cards leave no stale generated pages. Output folder handling must preserve unrelated files such as `.git` using a clearly owned output manifest/subdirectory when this feature is designed. Never include Submitted by. No app git commit/push. Generation does not mean “published.” Local catalogue is source of truth; generated site is disposable.

## Manual archive/restore (future, not first milestone)

No automatic backups. Eventually **Create Library Archive** and restore, primarily for replacement/new computers or backup recovery, not ongoing synchronization. No v1 merge behavior. Single custom-extension file (e.g. `.cug`), internally ordinary ZIP inspectable by renaming to `.zip`. Include consistent database/catalogue, all original media and relevant library/install settings sufficient to recreate the library. Exclude generated thumbnails. New-computer installation identity/range handling must be explicit on restore, avoiding silently cloning an active installation to a second computer.

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
