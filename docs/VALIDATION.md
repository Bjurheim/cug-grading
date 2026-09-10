# Milestone 1 validation

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
2. Adjust the window size and try natural field tabbing, text selection, copy/paste and multiline notes. Inspect the dark UI on your display. Inspection and Photos must remain disabled.
3. Create several incomplete cards; switch between them after typing and close/relaunch. Verify the last edits, blank fields and fixed 10-digit serials. Native close waits for saves; forced termination/power loss can still lose the unsaved debounce interval.
4. Change to a new allocation range; verify the old range is retired, prior cards retain their serials and new cards use the new range. Try zero, an occupied next serial, an out-of-range pointer and an exhausted range on a disposable library.
5. Open another library and reopen the original. Rename/move an entire library only while the app is closed; the next launch should report the missing location and permit explicit selection rather than replacing it.
6. On a disposable library, test unavailable/read-only storage and save retry. Failed saves must remain visibly unsaved and normal close/navigation must not discard the draft. Do not use your only copy for fault injection.

No later-milestone inspection, photos, public-site generation or archive/restore features were implemented.
