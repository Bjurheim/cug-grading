import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const release = join(root, 'release')
const command = process.argv[2] ?? 'host'
const hostTarget = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : null
const macArch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : null

const knownReleaseEntry = name =>
  ['.DS_Store', '.cards-under-glass-packages', 'builder-debug.yml', 'builder-effective-config.yaml', 'package-manifest.json',
    'mac', 'mac-arm64', 'mac-universal', 'win-unpacked', 'linux-unpacked'].includes(name) ||
  /^(macos-(arm64|x64)|windows-x64|linux-x64)$/.test(name) ||
  /^cards-under-glass-[0-9].*/.test(name)

function cleanRelease() {
  if (basename(release) !== 'release' || relative(root, release) !== 'release') throw new Error('Refusing to clean an unexpected package path.')
  if (existsSync(release)) {
    const unknown = readdirSync(release).filter(name => !knownReleaseEntry(name))
    if (unknown.length) throw new Error(`Refusing to clean release because it contains unknown entries: ${unknown.join(', ')}`)
    rmSync(release, { recursive: true })
  }
  mkdirSync(release, { recursive: true })
}

function runNode(script, args = []) {
  execFileSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  })
}

function definition(target) {
  if (target === 'mac') {
    if (process.platform !== 'darwin') throw new Error('macOS packages must be built on macOS.')
    if (!macArch) throw new Error(`Unsupported macOS build architecture: ${process.arch}`)
    return { key: `macos-${macArch}`, args: ['--mac', 'dmg', 'zip', `--${macArch}`] }
  }
  if (target === 'win') return { key: 'windows-x64', args: ['--win', 'nsis', '--x64'] }
  if (target === 'linux') return { key: 'linux-x64', args: ['--linux', 'AppImage', 'deb', '--x64'] }
  throw new Error(`Unknown package target: ${target}`)
}

if (command === 'clean') {
  cleanRelease()
  console.log(`Clean package output: ${release}`)
  process.exit(0)
}

if (!['host', 'mac', 'win', 'linux', 'all'].includes(command)) throw new Error('Use host, mac, win, linux, all, or clean.')
if (command === 'host' && !hostTarget) throw new Error(`Unsupported packaging host: ${process.platform}`)
if (command === 'all' && process.platform !== 'darwin') throw new Error('package:all includes macOS and therefore must run on macOS. Use the native CI matrix on other hosts.')

const targets = command === 'all' ? ['mac', 'win', 'linux'] : [command === 'host' ? hostTarget : command]
cleanRelease()

try {
  runNode('node_modules/electron-vite/bin/electron-vite.js', ['build'])
  const keys = []
  for (const target of targets) {
    const { key, args } = definition(target)
    keys.push(key)
    const output = `release/${key}`
    console.log(`\nPackaging ${key} from current source…`)
    runNode('node_modules/electron-builder/cli.js', [...args, '--publish', 'never', `--config.directories.output=${output}`])
  }
  runNode('scripts/validate-packages.mjs', keys)
} catch (error) {
  rmSync(release, { recursive: true, force: true })
  throw error
}
