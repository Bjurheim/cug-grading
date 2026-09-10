# Cards Under Glass

A quiet, local home for your collectible cards. The current application includes library setup, permanent serial allocation, a dense paged list, optional metadata, inspection grading, centering calculations, defect markers, reversible finalization, reliable autosave, and an optional photo workbench with thumbnails and full-resolution viewing. Public-site generation and archives are intentionally future work.

## Development

Install Node.js 24+ and pnpm 11.19.0, then:

```sh
pnpm install
pnpm dev
```

Choose **Create a library**, select an empty local folder, name your workstation and save its serial allocation (default 1–50,000). Create a card and edit any optional metadata. Open Inspection to enter grades and centering, add optional defect markers, and finalize when all required assessment fields are complete. Open Photos to import primary or additional images, lock important images against accidental removal, and link them to markers. Use Library settings to configure future allocations or open another library.

## Validation and packaging

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm package
pnpm test:desktop
pnpm test:packaged
pnpm test:development
pnpm dist
```

`pnpm check` runs typechecking, foundation tests and production build. No separate linter is configured; strict TypeScript checks unused code. `package` makes an unpacked host application under `release`; `dist` builds the configured host installers. `test:desktop` normally launches `out/main/index.js` after a build. Set `CUG_PACKAGED_EXECUTABLE` to test a packaged executable instead. The native OS CI matrix exercises packaging and persistence on macOS, Windows and Linux. Releases still require signing/notarization for normal distribution.

The app uses bundled `node:sqlite`, so no SQLite native-addon rebuild step is needed. Sharp supplies platform-specific image binaries for thumbnail creation, so packages must be built and exercised on each target operating system. Installation preferences live in Electron userData; your selected library contains `catalogue.sqlite`, `media/originals` and `cache/thumbnails`. Do not move/copy a library while it is open. No automatic backups or synchronization.

- [Product specification](docs/PRODUCT_SPEC.md)
- [Architecture and decisions](docs/ARCHITECTURE.md)
- [Validation and manual checks](docs/VALIDATION.md)
- [Future-agent constraints](AGENTS.md)
