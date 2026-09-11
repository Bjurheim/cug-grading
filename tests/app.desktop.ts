import { test, expect, _electron as electron } from '@playwright/test'
import { createServer, type Server } from 'node:http'
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize, resolve } from 'node:path'
import sharp from 'sharp'
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
    await expect(page.getByText('In Progress', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('All changes saved', { exact: false })).toBeVisible()
    await expect(page.getByLabel('Card sections')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Close card' })).toHaveCount(0)
    await expect(page.getByText('CARD WORKSPACE', { exact: true })).toHaveCount(0)
    for (const [key, label] of Object.entries(fields)) {
      await page.getByLabel(label, { exact: key !== 'submittedBy' }).fill(key === 'cardName' ? 'Pikachu' : `Test ${key}`)
    }
    await expect(page.getByText('All changes saved', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Card library', exact: true }).click()
    await page.getByRole('button', { name: /0000000001 Pikachu/ }).click()
    await expect(page.getByLabel('Preview 0000000001')).toContainText('Pikachu')
    await page.getByRole('button', { name: 'Open card', exact: true }).click()
    await page.screenshot({ path: 'test-results/library-editor.png' })
    // Last keystroke followed by native window close must drain the debounce queue.
    await page.getByLabel('General Notes').fill('Last edit immediately before closing')
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await application.waitForEvent('close')
    application = await launch(); page = await application.firstWindow()
    await page.getByRole('button', { name: 'Card grading', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'No card open' })).toBeVisible()
    await page.getByRole('button', { name: 'Card library', exact: true }).click()
    await page.getByRole('button', { name: /0000000001/ }).click()
    await page.getByRole('button', { name: 'Open card', exact: true }).click()
    await expect(page.getByLabel('Card Name', { exact: true })).toHaveValue('Pikachu')
    await expect(page.getByLabel('General Notes')).toHaveValue('Last edit immediately before closing')
    for (const [key, label] of Object.entries(fields)) {
      await expect(page.getByLabel(label, { exact: key !== 'submittedBy' })).toHaveValue(key === 'cardName' ? 'Pikachu' : key === 'notes' ? 'Last edit immediately before closing' : `Test ${key}`)
    }
    await page.getByRole('button', { name: 'Card library', exact: true }).click()
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
    await front.click({ position: { x: 105, y: 70 } })
    await page.getByRole('button', { name: /Marker 2, front/ }).click()
    await page.getByLabel('Marker 2 note').fill('Upper print spot')
    await page.getByRole('button', { name: 'Finalize assessment' }).click()
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible()
    await page.getByLabel('Centering', { exact: true }).fill('9.0')
    await expect(page.getByText('Finalized — changes pending', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Finalize again' }).click()
    await expect(page.getByText('Finalized', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/inspection-workbench.png' })
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1050, 760))
    await expect(page.locator('main > header')).toHaveCount(0)
    const compactLayout = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.editor-chrome')!
      const cornerGrid = document.querySelector<HTMLElement>('.corner-photo-grid')!
      const edgeGrid = document.querySelector<HTMLElement>('.edge-photo-grid')!
      const cornerPreview = cornerGrid.querySelector<HTMLElement>('.empty-photo-slot')!
      const edgePreview = edgeGrid.querySelector<HTMLElement>('.empty-photo-slot')!
      return {
        headerHeight: header.getBoundingClientRect().height,
        cornerColumns: getComputedStyle(cornerGrid).gridTemplateColumns.split(' ').length,
        edgeColumns: getComputedStyle(edgeGrid).gridTemplateColumns.split(' ').length,
        cornerHeight: cornerPreview.getBoundingClientRect().height,
        edgeHeight: edgePreview.getBoundingClientRect().height
      }
    })
    expect(compactLayout.headerHeight).toBeLessThan(100)
    expect(compactLayout.cornerColumns).toBe(2); expect(compactLayout.edgeColumns).toBe(2)
    expect(compactLayout.cornerHeight).toBeGreaterThanOrEqual(179); expect(compactLayout.cornerHeight).toBeLessThanOrEqual(231)
    expect(compactLayout.edgeHeight).toBeGreaterThanOrEqual(179); expect(compactLayout.edgeHeight).toBeLessThanOrEqual(231)
    const stickyTop = await page.locator('.editor-chrome').evaluate(element => element.getBoundingClientRect().top)
    await page.locator('.workspace-scroll').evaluate(element => { element.scrollTop = 500 })
    const stuckTop = await page.locator('.editor-chrome').evaluate(element => element.getBoundingClientRect().top)
    expect(Math.abs(stuckTop - stickyTop)).toBeLessThanOrEqual(1)
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected }) }, [frontPhoto])
    await page.getByRole('button', { name: 'Add Front photo' }).click()
    await expect(page.getByRole('button', { name: 'View Front' })).toBeVisible()
    const frontTile = page.locator('.photo-tile').filter({ has: page.getByRole('button', { name: 'View Front' }) })
    const frontLinks = frontTile.locator('details.photo-marker-links')
    await page.getByText('Link defect markers', { exact: true }).click()
    await page.getByLabel('Link Marker 1 — FRONT to Front').click()
    await page.getByLabel('Link Marker 2 — FRONT to Front').click()
    await expect(page.getByText('2 linked markers', { exact: true })).toBeVisible()
    await expect(frontLinks).toHaveJSProperty('open', true)
    await page.getByRole('button', { name: 'Lock Front' }).click()
    await expect(page.getByRole('button', { name: 'Replace Front' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remove Front' })).toHaveCount(0)
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selected }) }, [detailPhoto, webpPhoto])
    await page.getByRole('button', { name: /Add photos/ }).click()
    const detailTile = page.locator('.photo-tile').filter({ hasText: 'detail.png' })
    const evidenceTile = page.locator('.photo-tile').filter({ hasText: 'evidence.webp' })
    const detailLinks = detailTile.locator('details.photo-marker-links')
    const evidenceLinks = evidenceTile.locator('details.photo-marker-links')
    await expect(detailTile.locator('.photo-label strong')).toHaveText('detail.png')
    await expect(page.getByText('Untitled photo', { exact: true })).toHaveCount(0)
    await detailTile.getByRole('button', { name: 'Rename detail.png' }).click()
    await expect(detailTile.getByLabel('Rename detail.png')).toHaveValue('')
    await detailTile.getByLabel('Rename detail.png').fill('Cancelled title')
    await detailTile.getByRole('button', { name: 'Cancel' }).click()
    await expect(detailTile.locator('.photo-label strong')).toHaveText('detail.png')
    await detailTile.getByRole('button', { name: 'Rename detail.png' }).click()
    await detailTile.getByLabel('Rename detail.png').fill('Microscope — lower edge')
    await detailTile.getByRole('button', { name: 'Save' }).click()
    await expect(detailTile.locator('.photo-label strong')).toHaveText('Microscope — lower edge')
    await expect(detailTile.locator('.photo-label small')).toHaveText('detail.png')
    await detailTile.getByText('Link defect markers', { exact: true }).click()
    await detailTile.getByLabel('Link Marker 1 — FRONT to Microscope — lower edge').click()
    await evidenceTile.getByRole('button', { name: 'Lock evidence.webp' }).click()
    await evidenceTile.getByRole('button', { name: 'Rename evidence.webp' }).click()
    await evidenceTile.getByLabel('Rename evidence.webp').fill('Locked evidence')
    await evidenceTile.getByRole('button', { name: 'Save' }).click()
    await evidenceTile.getByRole('button', { name: 'Rename Locked evidence' }).click()
    await evidenceTile.getByLabel('Rename evidence.webp').fill('')
    await evidenceTile.getByRole('button', { name: 'Save' }).click()
    await expect(evidenceTile.locator('.photo-label strong')).toHaveText('evidence.webp')
    await page.getByRole('button', { name: 'Overview' }).click()
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await expect(detailTile.locator('.photo-label strong')).toHaveText('Microscope — lower edge')
    await expect(detailLinks).toHaveJSProperty('open', true)
    await expect(evidenceLinks).toHaveJSProperty('open', false)
    const inspectLinkedMarker = detailTile.getByRole('button', { name: 'Go to Marker 1 — FRONT' })
    await inspectLinkedMarker.scrollIntoViewIfNeeded()
    const photosScrollBeforeMarkerNavigation = await page.locator('.workspace-scroll').evaluate(element => element.scrollTop)
    expect(photosScrollBeforeMarkerNavigation).toBeGreaterThan(0)
    await inspectLinkedMarker.click()
    await expect(page.locator('.editor-tabs button.active')).toHaveText('Inspection')
    await expect(page.getByRole('heading', { name: '0000000001' })).toBeVisible()
    const selectedLinkedMarker = page.getByRole('button', { name: /Marker 1, front/ })
    await expect(selectedLinkedMarker).toHaveClass(/selected-marker/)
    await expect(page.getByLabel('Marker 1 note')).toHaveValue('Tiny surface line')
    await expect(page.getByRole('button', { name: 'View linked photo Front' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'View linked photo Microscope — lower edge' })).toBeVisible()
    await expect(page.locator('.marker-evidence')).toContainText('Locked')
    await page.screenshot({ path: 'test-results/linked-evidence.png' })
    const defectPosition = await page.locator('.defects').evaluate(element => ({ top: element.getBoundingClientRect().top, viewport: window.innerHeight }))
    expect(defectPosition.top).toBeGreaterThanOrEqual(80); expect(defectPosition.top).toBeLessThan(defectPosition.viewport)
    await page.getByRole('button', { name: 'View linked photo Front' }).click()
    await expect(page.getByRole('dialog', { name: 'Viewing Front' })).toBeVisible()
    await expect(page.locator('.editor-tabs button.active')).toHaveText('Inspection')
    await page.keyboard.press('Escape')
    await expect(selectedLinkedMarker).toHaveClass(/selected-marker/)
    await expect(page.getByLabel('Marker 1 note')).toHaveValue('Tiny surface line')
    await page.getByRole('button', { name: 'View linked photo Microscope — lower edge' }).click()
    await expect(page.getByRole('dialog', { name: 'Viewing Microscope — lower edge' })).toBeVisible()
    await page.getByRole('button', { name: 'Close photo viewer' }).click()
    await expect(page.locator('.editor-tabs button.active')).toHaveText('Inspection')
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await expect.poll(async () => Math.abs(await page.locator('.workspace-scroll').evaluate(element => element.scrollTop) - photosScrollBeforeMarkerNavigation)).toBeLessThanOrEqual(2)
    await expect(frontLinks).toHaveJSProperty('open', true)
    await expect(detailLinks).toHaveJSProperty('open', true)
    await expect(evidenceLinks).toHaveJSProperty('open', false)
    await page.getByRole('button', { name: 'Unlock Front' }).click()
    await page.getByRole('button', { name: 'Open Front photo' }).click()
    await expect(page.getByRole('dialog', { name: 'Viewing Front' })).toBeVisible()
    await page.keyboard.press('Escape')
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
    await page.getByRole('button', { name: 'Open card', exact: true }).click()
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
    await expect(page.locator('.photo-tile').filter({ hasText: 'Microscope — lower edge' }).locator('.photo-label small')).toHaveText('detail.png')
    await expect(page.locator('.photo-tile').filter({ hasText: 'evidence.webp' }).locator('.photo-label strong')).toHaveText('evidence.webp')
    const persistedDetailTile = page.locator('.photo-tile').filter({ hasText: 'Microscope — lower edge' })
    await persistedDetailTile.getByText('1 linked marker', { exact: true }).click()
    await persistedDetailTile.getByRole('button', { name: 'Remove Microscope — lower edge' }).click()
    await page.getByRole('button', { name: 'Remove permanently' }).click()
    await expect(persistedDetailTile).toHaveCount(0)
    await page.getByRole('button', { name: 'Inspection', exact: true }).click()
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await expect(page.locator('.photo-tile').filter({ hasText: 'Microscope — lower edge' })).toHaveCount(0)
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

test('library preview and Card Grading keep independent navigation state', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cug-navigation-'))
  const profile = join(temporary, 'profile'), folder = join(temporary, 'library')
  mkdirSync(folder)
  const application = await electron.launch({
    ...(process.env.CUG_PACKAGED_EXECUTABLE ? { executablePath: process.env.CUG_PACKAGED_EXECUTABLE } : {}),
    args: [...(process.env.CUG_PACKAGED_EXECUTABLE ? [] : [resolve('out/main/index.js')]), '--cug-test'],
    env: { ...process.env, CUG_TEST_PROFILE: profile }
  })
  try {
    const page = await application.firstWindow()
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, folder)
    await page.getByRole('button', { name: 'Create a library', exact: true }).click()
    await page.getByRole('button', { name: 'Save allocation' }).click()
    await page.evaluate(async () => {
      for (let index = 0; index < 30; index++) {
        const result = await window.cards.create()
        if (!result.ok) throw new Error(result.error)
      }
    })
    await page.reload()
    await expect(page.locator('.card-link').first()).toContainText('0000000030')
    await page.getByRole('button', { name: 'Card grading', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'No card open' })).toBeVisible()
    await page.getByRole('button', { name: 'Go to Card library' }).click()

    const originalRow = page.getByRole('button', { name: /0000000005 Unnamed Card/ })
    await originalRow.click()
    await expect(originalRow).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Preview 0000000005')).toBeVisible()
    await page.screenshot({ path: 'test-results/library-preview.png' })
    const libraryScrollBeforeOpen = await page.locator('.workspace-scroll').evaluate(element => element.scrollTop)
    expect(libraryScrollBeforeOpen).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Open card', exact: true }).click()
    await expect(page.getByRole('heading', { name: '0000000005' })).toBeVisible()
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await page.locator('.workspace-scroll').evaluate(element => { element.scrollTop = element.scrollHeight })
    const gradingScrollBeforeLeave = await page.locator('.workspace-scroll').evaluate(element => element.scrollTop)
    expect(gradingScrollBeforeLeave).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Card library', exact: true }).click()
    await expect(originalRow).toHaveAttribute('aria-pressed', 'true')
    await expect(originalRow).toBeInViewport()
    const previewOnlyRow = page.getByRole('button', { name: /0000000025 Unnamed Card/ })
    await previewOnlyRow.click()
    await expect(page.getByLabel('Preview 0000000025')).toBeVisible()
    await page.getByRole('button', { name: 'Card grading', exact: true }).click()
    await expect(page.getByRole('heading', { name: '0000000005' })).toBeVisible()
    await expect(page.locator('.editor-tabs button.active')).toHaveText('Photos')
    await expect.poll(async () => page.locator('.workspace-scroll').evaluate(element => element.scrollTop)).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Card library', exact: true }).click()
    await expect(previewOnlyRow).toHaveAttribute('aria-pressed', 'true')
    await expect(previewOnlyRow).toBeInViewport()
    await expect(page.getByLabel('Preview 0000000025')).toBeVisible()
    await page.getByRole('button', { name: 'Card grading', exact: true }).click()
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.getByLabel('Card Name', { exact: true }).fill('Navigation-safe edit')
    await page.getByRole('button', { name: 'Card library', exact: true }).click()
    await expect(page.locator('.card-link').first()).toContainText('0000000030')
    await page.getByRole('button', { name: 'Card grading', exact: true }).click()
    await expect(page.getByLabel('Card Name', { exact: true })).toHaveValue('Navigation-safe edit')

    await page.getByRole('button', { name: 'Card library', exact: true }).click()
    await page.getByRole('button', { name: 'Open card', exact: true }).click()
    await expect(page.getByRole('heading', { name: '0000000025' })).toBeVisible()
    await expect(page.locator('.editor-tabs button.active')).toHaveText('Overview')
  } finally { await application.close(); rmSync(temporary, { recursive: true, force: true }) }
})

test('create and restore a real library archive through Library settings', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cug-archive-desktop-'))
  const profile = join(temporary, 'profile'), folder = join(temporary, 'library')
  const restoredFolder = join(temporary, 'restored-library'), archive = join(temporary, 'My Library.cug')
  const evidence = join(temporary, 'evidence.png')
  mkdirSync(folder); mkdirSync(restoredFolder)
  const application = await electron.launch({
    ...(process.env.CUG_PACKAGED_EXECUTABLE ? { executablePath: process.env.CUG_PACKAGED_EXECUTABLE } : {}),
    args: [...(process.env.CUG_PACKAGED_EXECUTABLE ? [] : [resolve('out/main/index.js')]), '--cug-test'],
    env: { ...process.env, CUG_TEST_PROFILE: profile }
  })
  try {
    const page = await application.firstWindow()
    await page.screenshot({ path: evidence })
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, folder)
    await page.getByRole('button', { name: 'Create a library', exact: true }).click()
    await page.getByLabel('Workstation name').fill('Archive desk')
    await page.getByRole('button', { name: 'Save allocation' }).click()
    await page.getByRole('button', { name: 'New card' }).click()
    await page.getByLabel('Card Name', { exact: true }).fill('Archive round trip')
    await page.getByLabel('Submitted by').fill('Private owner')
    await page.getByRole('button', { name: 'Inspection', exact: true }).click()
    const front = page.getByRole('group', { name: 'front defect map' })
    await front.click({ position: { x: 45, y: 100 } })
    await page.getByRole('button', { name: /Marker 1, front/ }).click()
    await page.getByLabel('Marker 1 note').fill('Archive evidence marker')
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, evidence)
    await page.getByRole('button', { name: /Add photos/ }).click()
    const photo = page.locator('.photo-tile').filter({ hasText: 'evidence.png' })
    await photo.getByRole('button', { name: 'Rename evidence.png' }).click()
    await photo.getByRole('textbox').fill('Archive evidence')
    await photo.getByRole('button', { name: 'Save', exact: true }).click()
    await photo.getByText('Link defect markers', { exact: true }).click()
    await photo.getByLabel('Link Marker 1 — FRONT to Archive evidence').click()
    await photo.getByRole('button', { name: 'Lock Archive evidence' }).click()

    await page.getByRole('button', { name: 'Library settings' }).click()
    await expect(page.getByRole('heading', { name: 'Library archive', exact: true })).toBeVisible()
    await page.getByRole('heading', { name: 'Library archive', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: 'test-results/library-archive-settings.png' })
    await application.evaluate(({ dialog }, selected) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: selected }) }, archive)
    await page.getByRole('button', { name: 'Create Library Archive…' }).click()
    await expect(page.locator('.global-notice')).toContainText('My Library.cug was created successfully')
    expect(readFileSync(archive).subarray(0, 2).toString()).toBe('PK')

    await application.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = (async (...args: unknown[]) => {
        const options = args.at(-1) as { properties?: string[] }
        return { canceled: false, filePaths: [options.properties?.includes('openFile') ? paths.archive : paths.destination] }
      }) as typeof dialog.showOpenDialog
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    }, { archive, destination: restoredFolder })
    await page.getByRole('button', { name: 'Restore Library Archive…' }).click()
    await expect(page.locator('.global-notice')).toContainText('My Library.cug was restored and opened')
    await expect(page.getByRole('button', { name: /0000000001 Archive round trip/ })).toBeVisible()
    expect(readdirSync(join(restoredFolder, 'cache/thumbnails'))).toEqual([])

    await page.getByRole('button', { name: /0000000001 Archive round trip/ }).click()
    await page.getByRole('button', { name: 'Open card', exact: true }).click()
    await expect(page.getByLabel('Card Name', { exact: true })).toHaveValue('Archive round trip')
    await expect(page.getByLabel('Submitted by')).toHaveValue('Private owner')
    await page.getByRole('button', { name: 'Inspection', exact: true }).click()
    await page.getByRole('button', { name: /Marker 1, front/ }).click()
    await expect(page.getByLabel('Marker 1 note')).toHaveValue('Archive evidence marker')
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    const restoredPhoto = page.locator('.photo-tile').filter({ hasText: 'Archive evidence' })
    await expect(restoredPhoto).toBeVisible()
    await expect(restoredPhoto.getByRole('button', { name: 'Unlock Archive evidence' })).toBeVisible()
    await restoredPhoto.getByText('1 linked marker', { exact: true }).click()
    await expect(restoredPhoto.getByRole('button', { name: /Go to Marker 1/ })).toBeVisible()
    await restoredPhoto.getByRole('button', { name: 'View Archive evidence' }).click()
    await expect(page.getByRole('dialog', { name: 'Viewing Archive evidence' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect.poll(() => readdirSync(join(restoredFolder, 'cache/thumbnails')).length).toBeGreaterThan(0)
    const restoredInfo = await page.evaluate(async () => {
      const result = await window.cards.info()
      if (!result.ok || !result.value) throw new Error('Restored library info is unavailable')
      return result.value
    })
    expect(restoredInfo.folder).toBe(restoredFolder)
    expect(restoredInfo.installationName).toBe('Archive desk')
    expect(restoredInfo.allocation?.next).toBe(2)
  } finally { await application.close(); rmSync(temporary, { recursive: true, force: true }) }
})

test('generates a public site through Library settings and remembers its output folder', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cug-public-site-desktop-'))
  const profile = join(temporary, 'profile'), folder = join(temporary, 'library'), output = join(temporary, 'public-site')
  const portraitPhoto = join(temporary, 'portrait-front.png'), landscapePhoto = join(temporary, 'landscape-front.png')
  mkdirSync(folder); mkdirSync(output); writeFileSync(join(output, 'CNAME'), 'cards.example.test')
  await sharp({ create: { width: 520, height: 820, channels: 3, background: '#865d3d' } }).png().toFile(portraitPhoto)
  await sharp({ create: { width: 1040, height: 520, channels: 3, background: '#315f70' } }).png().toFile(landscapePhoto)
  const application = await electron.launch({
    ...(process.env.CUG_PACKAGED_EXECUTABLE ? { executablePath: process.env.CUG_PACKAGED_EXECUTABLE } : {}),
    args: [...(process.env.CUG_PACKAGED_EXECUTABLE ? [] : [resolve('out/main/index.js')]), '--cug-test'],
    env: { ...process.env, CUG_TEST_PROFILE: profile }
  })
  let server: Server | undefined
  try {
    const page = await application.firstWindow()
    const publicPhoto = join(temporary, 'public-front.png')
    await page.screenshot({ path: publicPhoto })
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, folder)
    await page.getByRole('button', { name: 'Create a library', exact: true }).click()
    await page.getByRole('button', { name: 'Save allocation' }).click()
    await page.evaluate(async () => {
      for (let index = 1; index <= 6; index += 1) {
        const created = await window.cards.create()
        if (!created.ok) throw new Error(created.error)
        const metadata = {
          game: index % 2 ? 'Pokémon' : 'One Piece', setName: `Public Set ${index}`, cardName: index === 1 ? 'Public site card' : `Catalogue card ${index}`,
          cardNumber: `${index}/88`, year: null, language: null, variant: index === 4 ? 'Foil' : null, rarity: null, manufacturer: null,
          submittedBy: index === 1 ? 'DESKTOP_PRIVATE_SUBMITTER' : null,
          notes: index === 1 ? 'DESKTOP_PRIVATE_GENERAL_NOTES' : null
        }
        const saved = await window.cards.save(created.value.card.id, created.value.card.revision, metadata)
        if (!saved.ok) throw new Error(saved.error)
        const inspection = { ...created.value.inspection }
        for (const key of ['centeringGrade', 'cornersGrade', 'edgesGrade', 'surfaceGrade', 'estimatedGrade'] as const) inspection[key] = 89 + index
        for (const key of ['verticalLeftTop', 'verticalLeftBottom', 'verticalRightTop', 'verticalRightBottom', 'horizontalUpperLeft', 'horizontalUpperRight', 'horizontalLowerLeft', 'horizontalLowerRight'] as const) inspection[key] = 200
        const inspected = await window.cards.saveInspection(created.value.card.id, saved.value.revision, inspection)
        if (!inspected.ok) throw new Error(inspected.error)
        const finalized = await window.cards.finalize(created.value.card.id, inspected.value.card.revision)
        if (!finalized.ok) throw new Error(finalized.error)
      }
    })
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, publicPhoto)
    await page.evaluate(async () => {
      const listed = await window.cards.list(0)
      const card = listed.ok ? listed.value.cards.find(candidate => candidate.serial === '0000000001') : undefined
      if (!card) throw new Error('Public card unavailable')
      const imported = await window.cards.choosePhotos(card.id, 'full_front')
      if (!imported.ok) throw new Error(imported.error)
      if (!imported.value) throw new Error('Public photo import was cancelled')
      const marker = await window.cards.addMarker(card.id, 'front', 0.34, 0.68)
      if (!marker.ok) throw new Error(marker.error)
      const noted = await window.cards.saveMarker(marker.value.id, 'Small print line under raking light')
      if (!noted.ok) throw new Error(noted.error)
      const linked = await window.cards.setPhotoMarkers(imported.value.photos[0].id, [marker.value.id])
      if (!linked.ok) throw new Error(linked.error)
    })
    for (const [serial, photo] of [['0000000003', portraitPhoto], ['0000000005', landscapePhoto]] as const) {
      await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, photo)
      await page.evaluate(async selectedSerial => {
        const listed = await window.cards.list(0)
        const card = listed.ok ? listed.value.cards.find(candidate => candidate.serial === selectedSerial) : undefined
        if (!card) throw new Error(`Public card ${selectedSerial} unavailable`)
        const imported = await window.cards.choosePhotos(card.id, 'full_front')
        if (!imported.ok) throw new Error(imported.error)
        if (!imported.value) throw new Error('Public photo import was cancelled')
      }, serial)
    }
    await page.reload()
    await page.getByRole('button', { name: 'Library settings' }).click()
    await expect(page.getByRole('heading', { name: 'Public site', exact: true })).toBeVisible()
    await expect(page.getByText('Generates new and changed reports and removes outdated reports.')).toBeVisible()
    await page.getByRole('heading', { name: 'Public site', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'test-results/public-site-settings-incremental.png', fullPage: true })
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, output)
    await page.getByRole('button', { name: 'Choose output folder…' }).click()
    await expect(page.getByText(output, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Update Public Site', exact: true }).click()
    await expect(page.locator('.global-notice')).toContainText('Public site updated: 6 new, 0 updated, 0 removed, 0 unchanged.')
    await page.getByRole('button', { name: 'Update Public Site', exact: true }).click()
    await expect(page.locator('.global-notice')).toContainText('Public site updated: 0 new, 0 updated, 0 removed, 6 unchanged.')
    await page.getByRole('button', { name: 'Rebuild Entire Site…', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Rebuild the entire public site?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Rebuild Entire Site…', exact: true }).click()
    await page.getByRole('button', { name: 'Rebuild entire site', exact: true }).click()
    await expect(page.locator('.global-notice')).toContainText('Public site rebuilt: 6 reports rebuilt.')
    expect(existsSync(join(output, 'cards/0000000001/index.html'))).toBe(true)
    expect(readFileSync(join(output, 'CNAME'), 'utf8')).toBe('cards.example.test')
    const generatedText = `${readFileSync(join(output, 'index.html'), 'utf8')}\n${readFileSync(join(output, 'cards/0000000001/index.html'), 'utf8')}\n${readFileSync(join(output, 'data/reports.json'), 'utf8')}`
    expect(generatedText).not.toContain('DESKTOP_PRIVATE_SUBMITTER')
    expect(generatedText).not.toContain('DESKTOP_PRIVATE_GENERAL_NOTES')
    server = createServer((request, response) => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      const relative = normalize(pathname).replace(/^[/\\]+/, '')
      let target = join(output, relative)
      if (pathname.endsWith('/')) target = join(target, 'index.html')
      if (!existsSync(target) || !statSync(target).isFile()) { response.writeHead(404); response.end(); return }
      response.writeHead(200); response.end(readFileSync(target))
    })
    await new Promise<void>(resolveListen => server!.listen(0, '127.0.0.1', resolveListen))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Static test server did not start')
    const siteWindow = application.waitForEvent('window')
    await application.evaluate(({ BrowserWindow }, url) => new BrowserWindow({ show: false, width: 1280, height: 900 }).loadURL(url), `http://127.0.0.1:${address.port}/`)
    const publicPage = await siteWindow
    await expect(publicPage.getByRole('heading', { name: 'Card Reports', exact: true })).toBeVisible()
    await expect(publicPage.locator('.result-count')).toHaveText('6 reports')
    const tileGeometry = await publicPage.evaluate(() => {
      const heights = [...document.querySelectorAll<HTMLElement>('.catalogue-image')].map(region => region.getBoundingClientRect().height)
      const image = document.querySelector<HTMLImageElement>('.catalogue-image img')
      return { minimumHeight: Math.min(...heights), maximumHeight: Math.max(...heights), count: heights.length, loading: image?.loading, source: image?.getAttribute('src') }
    })
    expect(tileGeometry.count).toBe(6)
    expect(tileGeometry.maximumHeight - tileGeometry.minimumHeight).toBeLessThanOrEqual(1)
    expect(tileGeometry.loading).toBe('lazy')
    expect(tileGeometry.source).toContain('-catalogue.webp')
    expect(tileGeometry.source).not.toContain('-preview.webp')
    await publicPage.screenshot({ path: 'test-results/public-catalogue-desktop.png', fullPage: true })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://'))?.setSize(1000, 760))
    await publicPage.screenshot({ path: 'test-results/public-catalogue-laptop.png', fullPage: true })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://'))?.setSize(420, 800))
    await publicPage.screenshot({ path: 'test-results/public-catalogue-mobile.png', fullPage: true })
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://'))?.setSize(1280, 900))
    await publicPage.getByPlaceholder('Serial, card name, set…').fill('1')
    const exactSerialResult = publicPage.locator('.catalogue-card[data-serial="0000000001"]')
    await expect(exactSerialResult).toBeVisible()
    await expect(publicPage.locator('.result-count')).toHaveText('1 report')
    await exactSerialResult.getByRole('link').click()
    await expect(publicPage.getByRole('heading', { name: 'Report #0000000001' })).toBeVisible()
    await expect(publicPage.getByRole('heading', { name: 'Public site card', exact: true })).toBeVisible()
    await expect(publicPage.getByText('Small print line under raking light')).toBeVisible()
    const markerInsideMap = await publicPage.locator('.defect-marker').evaluate(marker => {
      const markerBox = marker.getBoundingClientRect(), mapBox = marker.parentElement!.getBoundingClientRect()
      return markerBox.left >= mapBox.left && markerBox.right <= mapBox.right && markerBox.top >= mapBox.top && markerBox.bottom <= mapBox.bottom
    })
    expect(markerInsideMap).toBe(true)
    await publicPage.getByRole('button', { name: /Front photograph/ }).first().click()
    await expect(publicPage.getByRole('dialog')).toBeVisible()
    await publicPage.keyboard.press('Escape')
    await expect(publicPage.getByRole('dialog')).not.toBeVisible()
    await publicPage.screenshot({ path: 'test-results/public-report-polished.png', fullPage: true })
    await publicPage.close()
    await page.getByRole('button', { name: 'Card library', exact: true }).click()
    await page.getByRole('button', { name: 'Library settings' }).click()
    await expect(page.getByText(output, { exact: true })).toBeVisible()
  } finally { server?.close(); await application.close(); rmSync(temporary, { recursive: true, force: true }) }
})

test('native photo pickers share and persist the last successful import directory', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cug-photo-picker-'))
  const profile = join(temporary, 'profile'), library = join(temporary, 'library')
  const firstDirectory = join(temporary, 'deep', 'card-session', 'first')
  const multiDirectory = join(temporary, 'deep', 'card-session', 'additional')
  const replacementDirectory = join(temporary, 'available-again')
  mkdirSync(library); mkdirSync(firstDirectory, { recursive: true }); mkdirSync(multiDirectory, { recursive: true }); mkdirSync(replacementDirectory)
  const front = join(firstDirectory, 'front.png'), corner = join(firstDirectory, 'corner.png'), edge = join(firstDirectory, 'edge.png')
  const additionalOne = join(multiDirectory, 'additional-one.png'), additionalTwo = join(multiDirectory, 'additional-two.png'), replacement = join(multiDirectory, 'replacement.png')
  const back = join(replacementDirectory, 'back.png')
  for (const [index, file] of [front, corner, edge, additionalOne, additionalTwo, replacement, back].entries()) {
    await sharp({ create: { width: 12, height: 18, channels: 3, background: { r: 30 + index * 15, g: 90, b: 120 } } }).png().toFile(file)
  }
  const launch = () => electron.launch({
    ...(process.env.CUG_PACKAGED_EXECUTABLE ? { executablePath: process.env.CUG_PACKAGED_EXECUTABLE } : {}),
    args: [...(process.env.CUG_PACKAGED_EXECUTABLE ? [] : [resolve('out/main/index.js')]), '--cug-test'],
    env: { ...process.env, CUG_TEST_PROFILE: profile }
  })
  let application = await launch()
  try {
    let page = await application.firstWindow()
    await application.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }) }, library)
    await page.getByRole('button', { name: 'Create a library', exact: true }).click()
    await page.getByRole('button', { name: 'Save allocation' }).click()
    await page.getByRole('button', { name: 'New card' }).click()
    await page.getByRole('button', { name: 'Photos', exact: true }).click()

    const selections: Array<string[] | null> = [[front], [corner], [edge], [additionalOne, additionalTwo], null, [replacement], null, [back]]
    await application.evaluate(({ dialog }, queued) => {
      const state = { queued, calls: [] as Array<{ defaultPath: string | null; hasDefaultPath: boolean; multiple: boolean }> }
      ;(globalThis as typeof globalThis & { cugPhotoPickerState: typeof state }).cugPhotoPickerState = state
      dialog.showOpenDialog = (async (...args: unknown[]) => {
        const options = args[args.length - 1] as { defaultPath?: string; properties?: string[] }
        state.calls.push({
          defaultPath: options.defaultPath ?? null,
          hasDefaultPath: Object.prototype.hasOwnProperty.call(options, 'defaultPath'),
          multiple: options.properties?.includes('multiSelections') ?? false
        })
        const files = state.queued.shift()
        return files ? { canceled: false, filePaths: files } : { canceled: true, filePaths: [] }
      }) as typeof dialog.showOpenDialog
    }, selections)
    const calls = () => application.evaluate(() => (globalThis as typeof globalThis & { cugPhotoPickerState: { calls: Array<{ defaultPath: string | null; hasDefaultPath: boolean; multiple: boolean }> } }).cugPhotoPickerState.calls)

    await page.getByRole('button', { name: 'Add Front photo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View Front', exact: true })).toBeVisible()
    expect((await calls())[0]).toEqual({ defaultPath: null, hasDefaultPath: false, multiple: false })
    expect(JSON.parse(readFileSync(join(profile, 'preferences.json'), 'utf8')).lastPhotoImportDirectory).toBe(firstDirectory)

    await page.getByRole('button', { name: 'Add Top Left photo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View Top Left', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Add Top photo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View Top', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /Add photos/ }).click()
    await expect(page.getByText('additional-one.png', { exact: true })).toBeVisible()
    await expect(page.getByText('additional-two.png', { exact: true })).toBeVisible()
    const sharedCalls = await calls()
    expect(sharedCalls.slice(1, 4).map(call => call.defaultPath)).toEqual([firstDirectory, firstDirectory, firstDirectory])
    expect(sharedCalls[3].multiple).toBe(true)
    expect(JSON.parse(readFileSync(join(profile, 'preferences.json'), 'utf8')).lastPhotoImportDirectory).toBe(multiDirectory)

    await page.getByRole('button', { name: 'Add Back photo', exact: true }).click()
    await expect.poll(async () => (await calls()).length).toBe(5)
    expect((await calls())[4].defaultPath).toBe(multiDirectory)
    expect(JSON.parse(readFileSync(join(profile, 'preferences.json'), 'utf8')).lastPhotoImportDirectory).toBe(multiDirectory)

    await page.getByRole('button', { name: 'Replace Front', exact: true }).click()
    await page.getByRole('button', { name: 'Choose replacement', exact: true }).click()
    await expect(page.getByTitle('replacement.png')).toBeVisible()
    expect((await calls())[5].defaultPath).toBe(multiDirectory)

    rmSync(multiDirectory, { recursive: true, force: true })
    await page.getByRole('button', { name: 'Add Back photo', exact: true }).click()
    await expect.poll(async () => (await calls()).length).toBe(7)
    expect((await calls())[6]).toMatchObject({ defaultPath: null, hasDefaultPath: false })
    expect(JSON.parse(readFileSync(join(profile, 'preferences.json'), 'utf8')).lastPhotoImportDirectory).toBe(multiDirectory)
    await page.getByRole('button', { name: 'Add Back photo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'View Back', exact: true })).toBeVisible()
    expect((await calls())[7]).toMatchObject({ defaultPath: null, hasDefaultPath: false })
    expect(JSON.parse(readFileSync(join(profile, 'preferences.json'), 'utf8')).lastPhotoImportDirectory).toBe(replacementDirectory)

    await application.close()
    application = await launch(); page = await application.firstWindow()
    await page.getByRole('button', { name: /0000000001/ }).click()
    await page.getByRole('button', { name: 'Open card', exact: true }).click()
    await page.getByRole('button', { name: 'Photos', exact: true }).click()
    await application.evaluate(({ dialog }) => {
      const state = { calls: [] as Array<{ defaultPath: string | null; hasDefaultPath: boolean }> }
      ;(globalThis as typeof globalThis & { cugPhotoPickerRestartState: typeof state }).cugPhotoPickerRestartState = state
      dialog.showOpenDialog = (async (...args: unknown[]) => {
        const options = args[args.length - 1] as { defaultPath?: string }
        state.calls.push({ defaultPath: options.defaultPath ?? null, hasDefaultPath: Object.prototype.hasOwnProperty.call(options, 'defaultPath') })
        return { canceled: true, filePaths: [] }
      }) as typeof dialog.showOpenDialog
    })
    const restartCalls = () => application.evaluate(() => (globalThis as typeof globalThis & { cugPhotoPickerRestartState: { calls: Array<{ defaultPath: string | null; hasDefaultPath: boolean }> } }).cugPhotoPickerRestartState.calls)
    await page.getByRole('button', { name: 'Add Bottom Right photo', exact: true }).click()
    await page.getByRole('button', { name: 'Add Bottom Right photo', exact: true }).click()
    await expect.poll(async () => (await restartCalls()).length).toBe(2)
    expect(await restartCalls()).toEqual([
      { defaultPath: replacementDirectory, hasDefaultPath: true },
      { defaultPath: replacementDirectory, hasDefaultPath: true }
    ])
  } finally { await application.close(); rmSync(temporary, { recursive: true, force: true }) }
})
