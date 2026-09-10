import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { chromium, expect } from '@playwright/test'
const profile = mkdtempSync(join(tmpdir(), 'cug-dev-'))
const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const child = spawn(process.execPath, ['node_modules/electron-vite/bin/electron-vite.js', 'dev', '--remoteDebuggingPort', String(port), '--', '--cug-test'], {
  detached: process.platform !== 'win32', env: { ...process.env, CUG_TEST_PROFILE: profile }, stdio: ['ignore', 'pipe', 'pipe']
})
let output = ''
let connected
try {
  const endpoint = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Development launch timed out: ${output}`)), 30000)
    const inspect = data => {
      output += data.toString()
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) { clearTimeout(deadline); resolve(match[1]) }
    }
    child.stdout.on('data', inspect); child.stderr.on('data', inspect)
    child.once('exit', code => { clearTimeout(deadline); reject(new Error(`Development app exited ${code}: ${output}`)) })
  })
  connected = await chromium.connectOverCDP(endpoint)
  const page = connected.contexts()[0].pages()[0]
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('button', { name: 'Create a library', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Create a library', exact: true }).waitFor()
  await expect(page.getByRole('alert')).toHaveCount(0)
  if (errors.length) throw new Error(errors.join('\n'))
  await page.evaluate(() => window.close())
  console.log('Development server and React renderer loaded successfully, including reload and trusted IPC.')
} finally {
  await connected?.close()
  // These processes only own this temporary profile. Kill the whole test group on failure.
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
    else if (child.exitCode === null) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  } catch { /* The app may already have exited normally. */ }
  await new Promise(resolve => child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve))
  rmSync(profile, { recursive: true, force: true })
}
