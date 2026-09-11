import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const candidates = process.platform === 'darwin'
  ? ['release/macos-arm64/mac-arm64/Cards Under Glass.app/Contents/MacOS/Cards Under Glass', 'release/macos-x64/mac/Cards Under Glass.app/Contents/MacOS/Cards Under Glass']
  : process.platform === 'win32' ? ['release/windows-x64/win-unpacked/Cards Under Glass.exe'] : ['release/linux-x64/linux-unpacked/cards-under-glass']
const executable = candidates.map(resolvePath => resolve(resolvePath)).find(existsSync)
if (!executable) throw new Error('Packaged executable missing. Run pnpm package first.')
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit', env: { ...process.env, CUG_PACKAGED_EXECUTABLE: executable }
})
process.exit(result.status ?? 1)
