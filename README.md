# Cards Under Glass

A quiet, local home for your collectible cards. The current application includes library setup, permanent serial allocation, a dense paged list, optional metadata, inspection grading, centering calculations, defect markers, reversible finalization, reliable autosave, a photo workbench, complete manual Library Archive/Restore, and a portable static public-report generator.

## Development

Install Node.js 24+ and pnpm 11.19.0, then:

```sh
pnpm install
pnpm dev
```

Centering remains one manually entered grade, supported by separate Front and Back measurements and calculations. Finalization requires all sixteen measurements and five grading values. Older libraries keep their measurements as Front; previously finalized cards need Back measurements and finalization again. Foreign/orphaned legacy public reports remain preserved and rebuildable.

Choose **Create a library**, select an empty local folder, name your workstation and save its serial allocation (default 1–50,000). Card Library is the browsing workspace: cards remain in permanent serial-descending order, row selection opens a read-only preview, and **Open card** deliberately places that card in Card Grading. Card Grading keeps the active card’s Overview, Inspection and Photos workspaces available below its compact sticky identity header while you browse other cards. Use Library settings to configure allocations, create/restore a complete manual `.cug` backup, and generate a self-contained public site into a chosen local folder. **Update Public Site** publishes new/changed cards from this library, removes its ineligible reports, and preserves reports placed there by other libraries. **Rebuild Public Site** recreates all published report pages from their public snapshots while retaining public images. Private fields and unlinked Additional Photos are excluded, and neither operation performs synchronization, Git, or hosting work.

## Validation and packaging

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:desktop
pnpm package:mac
pnpm package:win
pnpm package:linux
pnpm package:all
pnpm package:validate
pnpm test:packaged
pnpm test:development
```

`pnpm check` runs typechecking, foundation tests and the production build. No separate linter is configured; strict TypeScript checks unused code. `pnpm package` packages the current host; `pnpm dist` is retained as the same compatibility alias. The explicit commands create macOS DMG/ZIP, Windows x64 NSIS, and Linux x64 AppImage/DEB packages. On macOS, `pnpm package:all` builds all three target sets from one current source build and fails if any requested target or structural check fails. `pnpm package:clean` safely removes recognized generated package output before a new run. Other hosts should use their matching package command or the native CI matrix because `package:all` includes macOS and is deliberately unavailable there.

Fresh output is separated under `release/macos-<architecture>`, `release/windows-x64`, and `release/linux-x64`; filenames contain the canonical version, operating system, architecture, and format. The canonical application version is the top-level `version` in `package.json`. A successful run writes `release/package-manifest.json` with artifact sizes, SHA-256 checksums, and native-dependency validation results. Packaging starts by removing only recognized package output, so old cross-builds cannot be mistaken for current artifacts.

`test:desktop` normally launches `out/main/index.js` after a build. `test:packaged` launches the current host package from its platform directory. The native OS CI matrix runs the matching package command and packaged Electron persistence/photo/site tests on macOS, Windows and Linux; Linux uses Xvfb. A package built for another OS on macOS is structurally validated, but that does not replace launching it on its native OS. Releases still require signing/notarization for normal distribution.

The app uses Electron's bundled `node:sqlite`, so there is no SQLite addon to rebuild or externalize. pnpm installs the supported Sharp optional binaries for macOS arm64/x64, Windows x64, and Linux glibc x64. electron-builder keeps Sharp and `@img` outside ASAR; an `afterPack` hook removes every non-target image binary from the staged package. `package:validate` then checks the Electron executable and all packaged Sharp/libvips native files for the requested operating system and CPU, confirms current application/migration feature markers in ASAR, and verifies every configured artifact format. Packages must still be exercised on each target operating system.

Installation preferences use Electron's platform-specific `userData` location; your selected library remains wherever you choose and contains `catalogue.sqlite`, `media/originals` and `cache/thumbnails`. Application, archive, media, temporary, and public-site paths use Node/Electron path APIs and portable relative paths. Do not move/copy a library while it is open. A `.cug` archive is an ordinary platform-independent ZIP containing a consistent database snapshot and originals; thumbnails regenerate after restore. Backups remain manual, restore never merges libraries, and catalogue synchronization is not supported. Generated public sites are ordinary static files with predictable `cards/<serial>/` pages and relative links suitable for root or subdirectory hosting. Each published report has a public-only `data/cards/<serial>.json` snapshot, allowing several independent libraries to coexist in one externally synchronized site. Synchronize that site directory with your chosen external tool before running Update, then synchronize it again afterward. If aggregate catalogue files conflict, preserve/merge the independent card snapshots and media, then rerun Update to reconstruct the catalogue.

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture and decisions](docs/ARCHITECTURE.md)
- [Validation and manual checks](docs/VALIDATION.md)
- [Future-agent constraints](AGENTS.md)
