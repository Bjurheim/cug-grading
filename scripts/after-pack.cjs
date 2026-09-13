const { existsSync, readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

/**
 * electron-builder v26 follows every Sharp optional dependency installed by
 * pnpm. Keep the multi-platform install tree for cross-packaging, then remove
 * non-target @img packages from the staged application before artifacts are
 * created. This prevents a macOS package from carrying Windows/Linux binaries
 * (and vice versa) while leaving the source node_modules tree untouched.
 */
module.exports = async context => {
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch]
  if (!arch) throw new Error(`Unsupported packaging architecture: ${context.arch}`)
  const platform = context.electronPlatformName
  const resources = platform === 'darwin'
    ? join(context.appOutDir, 'Cards Under Glass.app', 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  const imageModules = join(resources, 'app.asar.unpacked', 'node_modules', '@img')
  if (!existsSync(imageModules)) throw new Error('The staged package is missing Sharp native dependencies.')
  const keep = new Set(['colour'])
  if (platform === 'darwin') {
    keep.add(`sharp-darwin-${arch}`)
    keep.add(`sharp-libvips-darwin-${arch}`)
  } else if (platform === 'win32') {
    keep.add(`sharp-win32-${arch}`)
  } else if (platform === 'linux') {
    keep.add(`sharp-linux-${arch}`)
    keep.add(`sharp-libvips-linux-${arch}`)
  } else throw new Error(`Unsupported packaging platform: ${platform}`)
  for (const name of readdirSync(imageModules)) if (!keep.has(name)) rmSync(join(imageModules, name), { recursive: true, force: true })
}
