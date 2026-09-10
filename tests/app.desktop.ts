import { test, expect, _electron as electron } from '@playwright/test'
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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

test('inspection, finalization, marker and standard Quit menu persist', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cug-workbench-'))
  const profile = join(temporary, 'profile'), folder = join(temporary, 'library')
  mkdirSync(folder)
  const frontPhoto = join(temporary, 'front.png'), detailPhoto = join(temporary, 'detail.png'), replacementPhoto = join(temporary, 'replacement.png'), webpPhoto = join(temporary, 'evidence.webp')
  const launch = () => electron.launch({
    ...(process.env.CUG_PACKAGED_EXECUTABLE ? { executablePath: process.env.CUG_PACKAGED_EXECUTABLE } : {}),
    args: [...(process.env.CUG_PACKAGED_EXECUTABLE ? [] : [resolve('out/main/index.js')]), '--cug-test'],
    env: { ...process.env, CUG_TEST_PROFILE: profile }
  })
  let application = await launch()
  try {
    let page = await application.firstWindow()
    await page.screenshot({ path: frontPhoto })
    copyFileSync(frontPhoto, detailPhoto); copyFileSync(frontPhoto, replacementPhoto)
    const webp = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 4
      const context = canvas.getContext('2d')!; context.fillStyle = '#8fb9a5'; context.fillRect(0, 0, 4, 4)
      return canvas.toDataURL('image/webp').split(',')[1]
    })
    writeFileSync(webpPhoto, Buffer.from(webp, 'base64'))
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, folder)
    await page.getByRole('button', { name: 'Create a library', exact: true }).click()
    await page.getByRole('button', { name: 'Save allocation' }).click()
    await page.getByRole('button', { name: 'New card' }).click()
    await page.getByRole('button', { name: 'Inspection', exact: true }).click()
    for (const label of ['Centering', 'Corners', 'Edges', 'Surface', 'Estimated Grade']) await page.getByLabel(label, { exact: true }).fill(label === 'Estimated Grade' ? '9' : '9.5')
    for (const label of ['Vertical Left Top Left', 'Vertical Left Bottom Left', 'Vertical Right Top Right', 'Vertical Right Bottom Right', 'Horizontal Upper Upper Left', 'Horizontal Upper Upper Right', 'Horizontal Lower Lower Left', 'Horizontal Lower Lower Right']) await page.getByLabel(label, { exact: true }).fill('2.5')
    await page.getByLabel('Corners notes', { exact: true }).click()
    await page.getByLabel('Corners notes text').fill('Sharp under magnification')
    await expect(page.getByLabel('Centering notes', { exact: true })).toHaveCount(1)
    await page.getByLabel('Centering notes', { exact: true }).click()
    await page.getByLabel('Centering notes text').fill('Judged from all four ratios')
    const front = page.getByRole('group', { name: 'front defect map' })
    await front.click({ position: { x: 38, y: 150 } })
    await page.getByRole('button', { name: /Marker 1, front/ }).click()
    await page.getByLabel('Marker 1 note').fill('Tiny surface line')
    await page.getByRole('button', { name: 'Finalize assessment' }).click()
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible()
    await page.getByLabel('Centering', { exact: true }).fill('9.0')
    await expect(page.getByText('Finalized — changes pending', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Finalize again' }).click()
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/inspection-workbench.png' })
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected }) }, [frontPhoto])
    await page.getByRole('button', { name: 'Add Front photo' }).click()
    await expect(page.getByRole('button', { name: 'View Front' })).toBeVisible()
    await page.getByText('Link defect markers', { exact: true }).click()
    await page.getByLabel(/Marker 1 — FRONT/).click()
    await expect(page.getByText('1 linked marker', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Lock Front' }).click()
    await expect(page.getByRole('button', { name: 'Replace Front' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remove Front' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Unlock Front' }).click()
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected }) }, [detailPhoto, webpPhoto])
    await page.getByRole('button', { name: /Add photos/ }).click()
    await page.getByLabel('Title for detail.png').fill('Microscope — lower edge')
    await expect(page.getByTitle('evidence.webp')).toBeVisible()
    await page.getByRole('button', { name: 'Overview' }).click()
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await expect(page.getByLabel('Title for detail.png')).toHaveValue('Microscope — lower edge')
    await page.getByRole('button', { name: 'View Front' }).click()
    await expect(page.getByRole('dialog', { name: 'Viewing Front' })).toBeVisible()
    await page.getByRole('button', { name: 'Close photo viewer' }).click()
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected }) }, [replacementPhoto])
    await page.getByRole('button', { name: 'Replace Front' }).click()
    await page.getByRole('button', { name: 'Choose replacement' }).click()
    await expect(page.getByTitle('replacement.png')).toBeVisible()
    await page.screenshot({ path: 'test-results/photos-workbench.png' })
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Overview' }).click()
    await page.getByLabel('Card Name', { exact: true }).fill('Quit-safe card')
    const quitAccelerator = await application.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('quit-app')?.accelerator)
    if (process.platform === 'darwin') {
      expect(quitAccelerator).toBe('Command+Q')
    }
    await application.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('quit-app')?.click())
    await application.waitForEvent('close')

    application = await launch(); page = await application.firstWindow()
    await page.getByRole('button', { name: /0000000001 Quit-safe card/ }).click()
    await page.getByRole('button', { name: 'Inspection', exact: true }).click()
    await expect(page.getByLabel('Centering', { exact: true })).toHaveValue('9.0')
    await expect(page.getByLabel('Corners', { exact: true })).toHaveValue('9.5')
    await expect(page.getByLabel('Estimated Grade', { exact: true })).toHaveValue('9.0')
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible()
    await page.getByLabel('Centering notes', { exact: true }).click()
    await expect(page.getByLabel('Centering notes text')).toHaveValue('Judged from all four ratios')
    await page.getByRole('button', { name: /Marker 1, front/ }).click()
    await expect(page.getByLabel('Marker 1 note')).toHaveValue('Tiny surface line')
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await expect(page.getByTitle('replacement.png')).toBeVisible()
    await expect(page.getByLabel('Title for detail.png')).toHaveValue('Microscope — lower edge')
    await expect(page.getByTitle('evidence.webp')).toBeVisible()
    await page.getByRole('button', { name: 'Overview' }).click()
    await expect(page.getByLabel('Include on public site')).toBeChecked()
    await page.getByRole('button', { name: 'Delete card…' }).click()
    await expect(page.getByRole('dialog')).toContainText('can never be issued again')
    await page.getByRole('button', { name: 'Delete permanently' }).click()
    await expect(page.getByText('Your collection starts here')).toBeVisible()
    await page.getByRole('button', { name: 'New card' }).click()
    await expect(page.getByRole('heading', { name: /0000000002/ })).toBeVisible()
  } finally { await application.close(); rmSync(temporary, { recursive: true, force: true }) }
})
