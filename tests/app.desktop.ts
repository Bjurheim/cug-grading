import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fields } from '../src/shared/contracts'

test('create, edit, close immediately and reopen a real library in Electron', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cug-desktop-'))
  const profile = join(temporary, 'profile'), folder = join(temporary, 'library')
  mkdirSync(folder)
  const launch = () => electron.launch({
    ...(process.env.CUG_PACKAGED_EXECUTABLE ? { executablePath: process.env.CUG_PACKAGED_EXECUTABLE } : {}),
    args: [...(process.env.CUG_PACKAGED_EXECUTABLE ? [] : [resolve('out/main/index.js')]), '--cug-test'],
    env: { ...process.env, CUG_TEST_PROFILE: profile }
  })
  let application = await launch()
  try {
    let page = await application.firstWindow()
    await expect(page.getByText('A little order.')).toBeVisible()
    const preferences = await application.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): { contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean } }).getLastWebPreferences())
    expect(preferences.contextIsolation).toBe(true); expect(preferences.nodeIntegration).toBe(false); expect(preferences.sandbox).toBe(true)
    expect(await page.evaluate(() => typeof (globalThis as Record<string, unknown>).require)).toBe('undefined')
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, folder)
    await page.getByRole('button', { name: 'Create a library', exact: true }).click()
    await page.getByLabel('Workstation name').fill('Desk one')
    await page.getByRole('button', { name: 'Save allocation' }).click()
    await page.getByRole('button', { name: 'New card' }).click()
    await expect(page.getByRole('heading', { name: '0000000001' })).toBeVisible()
    for (const [key, label] of Object.entries(fields)) {
      await page.getByLabel(label, { exact: key !== 'submittedBy' }).fill(key === 'cardName' ? 'Pikachu' : `Test ${key}`)
    }
    await expect(page.getByText('All changes saved', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /0000000001 Pikachu/ })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'test-results/library-editor.png' })
    // Last keystroke followed by native window close must drain the debounce queue.
    await page.getByLabel('General Notes').fill('Last edit immediately before closing')
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await application.waitForEvent('close')
    application = await launch(); page = await application.firstWindow()
    await page.getByRole('button', { name: /0000000001/ }).click()
    await expect(page.getByLabel('Card Name', { exact: true })).toHaveValue('Pikachu')
    await expect(page.getByLabel('General Notes')).toHaveValue('Last edit immediately before closing')
    for (const [key, label] of Object.entries(fields)) {
      await expect(page.getByLabel(label, { exact: key !== 'submittedBy' })).toHaveValue(key === 'cardName' ? 'Pikachu' : key === 'notes' ? 'Last edit immediately before closing' : `Test ${key}`)
    }
    await page.getByRole('button', { name: 'New card' }).click()
    await expect(page.getByRole('heading', { name: '0000000002' })).toBeVisible()
    await expect(page.getByLabel('Card Name', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Library settings' }).click()
    await expect(page.getByLabel('Next serial')).toHaveValue('0000000003')
    await expect(page.getByLabel('Workstation name')).toHaveValue('Desk one')
  } finally { await application.close(); rmSync(temporary, { recursive: true, force: true }) }
})
