import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFile, listPackage } from '@electron/asar'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const release = join(root, 'release')
const application = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const requested = process.argv.slice(2)

const platform = {
  'macos-arm64': {
    os: 'macOS', arch: 'arm64', unpacked: 'mac-arm64/Cards Under Glass.app/Contents/Resources',
    executable: 'mac-arm64/Cards Under Glass.app/Contents/MacOS/Cards Under Glass', artifacts: ['.dmg', '.zip'], binary: 'macho-arm64', sharp: 'sharp-darwin-arm64', libvips: 'sharp-libvips-darwin-arm64'
  },
  'macos-x64': {
    os: 'macOS', arch: 'x64', unpacked: 'mac/Cards Under Glass.app/Contents/Resources',
    executable: 'mac/Cards Under Glass.app/Contents/MacOS/Cards Under Glass', artifacts: ['.dmg', '.zip'], binary: 'macho-x64', sharp: 'sharp-darwin-x64', libvips: 'sharp-libvips-darwin-x64'
  },
  'windows-x64': {
    os: 'Windows', arch: 'x64', unpacked: 'win-unpacked/resources', executable: 'win-unpacked/Cards Under Glass.exe',
    artifacts: ['.exe'], binary: 'pe-x64', sharp: 'sharp-win32-x64'
  },
  'linux-x64': {
    os: 'Linux', arch: 'x64', unpacked: 'linux-unpacked/resources', executable: 'linux-unpacked/cards-under-glass',
    artifacts: ['.AppImage', '.deb'], binary: 'elf-x64', sharp: 'sharp-linux-x64', libvips: 'sharp-libvips-linux-x64'
  }
}

function walk(folder, prefix = '') {
  if (!existsSync(folder)) return []
  const result = []
  for (const name of readdirSync(folder)) {
    const absolute = join(folder, name), path = prefix ? `${prefix}/${name}` : name, stat = lstatSync(absolute)
    // macOS application/framework bundles intentionally contain internal
    // symlinks. Do not follow them while inventorying regular package files.
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) result.push(...walk(absolute, path))
    else if (stat.isFile()) result.push(path)
  }
  return result
}

function binaryKind(path) {
  const bytes = readFileSync(path)
  if (bytes.length >= 20 && bytes[0] === 0x7f && bytes.subarray(1, 4).toString() === 'ELF') {
    if (bytes[4] !== 2 || bytes[5] !== 1) return 'elf-other'
    return bytes.readUInt16LE(18) === 0x3e ? 'elf-x64' : 'elf-other'
  }
  if (bytes.length >= 64 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
    const header = bytes.readUInt32LE(0x3c)
    if (header + 6 > bytes.length || bytes.subarray(header, header + 4).toString('hex') !== '50450000') return 'pe-other'
    return bytes.readUInt16LE(header + 4) === 0x8664 ? 'pe-x64' : 'pe-other'
  }
  if (bytes.length >= 8) {
    const magic = bytes.readUInt32LE(0)
    if (magic === 0xfeedfacf) {
      const cpu = bytes.readUInt32LE(4)
      if (cpu === 0x0100000c) return 'macho-arm64'
      if (cpu === 0x01000007) return 'macho-x64'
      return 'macho-other'
    }
  }
  return 'unknown'
}

function checksum(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function validate(key) {
  const expected = platform[key]
  if (!expected) throw new Error(`Unknown package validation target: ${key}`)
  const output = join(release, key)
  if (!existsSync(output) || !statSync(output).isDirectory()) throw new Error(`Package output is missing: ${output}`)
  const resourceRoot = join(output, expected.unpacked)
  const asar = join(resourceRoot, 'app.asar')
  const executable = join(output, expected.executable)
  if (!existsSync(asar) || !existsSync(executable)) throw new Error(`${key} unpacked application is incomplete.`)
  if (binaryKind(executable) !== expected.binary) throw new Error(`${key} Electron executable has the wrong platform or architecture.`)

  const packagedMetadata = JSON.parse(extractFile(asar, 'package.json').toString('utf8'))
  if (packagedMetadata.version !== application.version || packagedMetadata.name !== application.name) throw new Error(`${key} package metadata does not match the current application.`)
  const main = extractFile(asar, 'out/main/index.js').toString('utf8')
  const rendererFiles = listPackage(asar, {}).filter(path => /^\/out\/renderer\/assets\/index-.*\.js$/.test(path))
  if (rendererFiles.length !== 1) throw new Error(`${key} renderer bundle is missing or ambiguous.`)
  const renderer = extractFile(asar, rendererFiles[0].slice(1)).toString('utf8')
  for (const marker of ['node:sqlite', 'archive:create', 'site:generate', 'schema_migrations', 'serial_reservations', 'centeringGrade', 'photo_defect_markers', 'library_metadata', 'cards-under-glass-public-owner:', 'data/cards', 'frontVerticalLeftTop', 'backVerticalLeftTop']) {
    if (!main.includes(marker)) throw new Error(`${key} does not contain the current main-process feature/migration marker: ${marker}`)
  }
  for (const marker of ['Card grading', 'Update Public Site', 'Rebuild Public Site']) {
    if (!renderer.includes(marker)) throw new Error(`${key} does not contain the current renderer feature marker: ${marker}`)
  }

  const unpacked = `${asar}.unpacked`
  const nativeFiles = walk(unpacked).filter(path => /\.(node|dylib|dll)$/.test(path) || /\.so(?:\.|$)/.test(path))
  const sharpNative = nativeFiles.filter(path => path.includes('/@img/') && path.endsWith('.node'))
  if (sharpNative.length !== 1 || !sharpNative[0].includes(`/${expected.sharp}/`)) throw new Error(`${key} has missing, duplicate, or wrong-platform Sharp native modules: ${sharpNative.join(', ')}`)
  for (const path of nativeFiles.filter(path => path.includes('/@img/'))) {
    if (binaryKind(join(unpacked, ...path.split('/'))) !== expected.binary) throw new Error(`${key} contains a wrong-platform native image binary: ${path}`)
  }
  if (expected.libvips && !nativeFiles.some(path => path.includes(`/${expected.libvips}/`))) throw new Error(`${key} is missing its target libvips runtime.`)

  const artifacts = walk(output).filter(path => !path.includes('/') && expected.artifacts.includes(extname(path)))
  for (const extension of expected.artifacts) if (!artifacts.some(path => extname(path) === extension)) throw new Error(`${key} is missing its ${extension} artifact.`)
  return {
    target: key, os: expected.os, architecture: expected.arch, applicationVersion: application.version,
    packageFormats: expected.artifacts.map(value => value.slice(1)), nativeDependencyValidation: 'passed',
    artifacts: artifacts.map(path => { const absolute = join(output, path); return { path: relative(root, absolute).split('\\').join('/'), bytes: statSync(absolute).size, sha256: checksum(absolute) } })
  }
}

const available = Object.keys(platform).filter(key => existsSync(join(release, key)))
const keys = requested.length ? requested : available
if (!keys.length) throw new Error('No current structured package output exists. Run a package command first.')
const targets = keys.map(validate)
const manifest = { generator: 'Cards Under Glass package validation', generatedAt: new Date().toISOString(), applicationVersion: application.version, packagingSystem: `electron-builder ${application.devDependencies['electron-builder']}`, host: `${process.platform}-${process.arch}`, targets }
mkdirSync(release, { recursive: true })
writeFileSync(join(release, 'package-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
for (const target of targets) console.log(`Validated ${target.target}: ${target.artifacts.map(item => basename(item.path)).join(', ')}`)
console.log(`Package manifest: ${join(release, 'package-manifest.json')}`)
