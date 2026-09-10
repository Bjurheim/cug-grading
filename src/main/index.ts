import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Library, validatePhotoSlot } from './library'
import { writePhotoThumbnail } from './photos'
import type { Result } from '../shared/contracts'

if (process.argv.includes('--cug-test') && process.env.CUG_TEST_PROFILE) app.setPath('userData', process.env.CUG_TEST_PROFILE)
protocol.registerSchemesAsPrivileged([{ scheme: 'cug-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
interface Preferences { installationId: string; libraryFolder?: string }
let preferences: Preferences
let library: Library | undefined
let window: BrowserWindow | undefined
let closeAllowed = false
let closing = false
let finishFlush: ((ok: boolean) => void) | undefined
const preferencesPath = () => join(app.getPath('userData'), 'preferences.json')
function persistPreferences(next: Preferences): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  const temporary = `${preferencesPath()}.tmp`
  writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600, flush: true })
  renameSync(temporary, preferencesPath())
  preferences = next
}
function active(): Library { if (!library) throw new Error('Choose a library first.'); return library }
const rendererFile = join(__dirname, '../renderer/index.html')
const developmentUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const trustedUrl = () => developmentUrl ? new URL(developmentUrl).href : pathToFileURL(rendererFile).href
function register(channel: string, handler: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
    try {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== trustedUrl()) throw new Error('Untrusted request.')
      return { ok: true, value: await handler(...args) }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.' } }
  })
}
async function start(): Promise<void> {
  if (existsSync(preferencesPath())) {
    preferences = JSON.parse(readFileSync(preferencesPath(), 'utf8')) as Preferences
    if (!/^[0-9a-f-]{36}$/i.test(preferences.installationId)) throw new Error('Installation settings are invalid. Restore preferences.json before continuing.')
  } else persistPreferences({ installationId: randomUUID() })
  let startupError: string | undefined
  if (preferences.libraryFolder) {
    try { library = new Library(preferences.libraryFolder, preferences.installationId, false, writePhotoThumbnail) }
    catch (e) { startupError = `Could not reopen your library. Your files have not been replaced.\n${String(e)}` }
  }
  register('library:info', () => library?.info() ?? null)
  register('library:choose', async (create) => {
    if (typeof create !== 'boolean') throw new Error('Invalid folder request.')
    const selected = await dialog.showOpenDialog(window!, { title: create ? 'Choose an empty folder for your new library' : 'Open a Cards Under Glass library', properties: ['openDirectory', 'createDirectory'] })
    if (selected.canceled || !selected.filePaths[0]) return null
    const folder = selected.filePaths[0]
    if (!create && library?.folder === folder) return library.info()
    const candidate = new Library(folder, preferences.installationId, create, writePhotoThumbnail)
    try { persistPreferences({ ...preferences, libraryFolder: folder }) }
    catch (e) { candidate.close(); throw e }
    library?.close(); library = candidate
    return library.info()
  })
  register('library:configure', setup => active().configure(setup))
  register('cards:list', offset => active().list(offset))
  register('cards:get', id => active().get(id))
  register('cards:create', () => active().create())
  register('cards:save', (id, revision, metadata) => active().save(id, revision, metadata))
  register('inspection:save', (id, revision, inspection) => active().saveInspection(id, revision, inspection))
  register('cards:include-public', (id, revision, include) => active().setIncludePublic(id, revision, include))
  register('markers:add', (cardId, side, x, y) => active().addMarker(cardId, side, x, y))
  register('markers:save', (id, note) => active().saveMarker(id, note))
  register('markers:remove', id => active().removeMarker(id))
  register('photos:choose', async (cardId, slot) => {
    validatePhotoSlot(slot)
    active().get(cardId)
    const selected = await dialog.showOpenDialog(window!, {
      title: slot === null ? 'Add photos' : 'Choose a photo',
      properties: slot === null ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (selected.canceled || !selected.filePaths.length) return null
    return active().importPhotos(cardId, slot, selected.filePaths)
  })
  register('photos:import', (cardId, slot, paths) => active().importPhotos(cardId, slot, paths))
  register('photos:title', (id, title) => active().savePhotoTitle(id, title))
  register('photos:lock', (id, locked) => active().setPhotoLocked(id, locked))
  register('photos:markers', (id, markerIds) => active().setPhotoMarkers(id, markerIds))
  register('photos:remove', id => active().removePhoto(id))
  register('cards:finalize', (id, revision) => active().finalize(id, revision))
  register('cards:delete', id => active().delete(id))
  register('app:flushed', ok => { finishFlush?.(ok === true); return null })
  Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'darwin' ? [
    { label: 'Cards Under Glass', submenu: [
      { role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
      { type: 'separator' }, { id: 'quit-app', label: 'Quit Cards Under Glass', accelerator: 'Command+Q', click: () => window?.close() }
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ] : [
    { label: 'File', submenu: [{ id: 'quit-app', label: 'Quit', accelerator: 'Alt+F4', click: () => window?.close() }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
  ]))
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  await protocol.handle('cug-media', async request => {
    try {
      const url = new URL(request.url), variant = url.hostname
      if (request.method !== 'GET' || (variant !== 'thumbnail' && variant !== 'original') || !url.pathname.startsWith('/') || url.pathname.slice(1).includes('/')) throw new Error('Invalid media request.')
      const path = await active().photoFile(decodeURIComponent(url.pathname.slice(1)), variant)
      return net.fetch(pathToFileURL(path).href)
    } catch { return new Response('', { status: 404 }) }
  })
  window = new BrowserWindow({
    width: 1400, height: 920, minWidth: 1000, minHeight: 700, backgroundColor: '#111517',
    title: 'Cards Under Glass',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('will-attach-webview', event => event.preventDefault())
  window.on('close', event => {
    if (closeAllowed) return
    event.preventDefault()
    if (closing) return
    closing = true
    void (async () => {
      const ok = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => { finishFlush = undefined; resolve(false) }, 15000)
        finishFlush = result => { clearTimeout(timer); finishFlush = undefined; resolve(result) }
        window!.webContents.send('app:flush')
      })
      if (ok) {
        closeAllowed = true
        // Closing the now-authorized window completes both normal window closes and
        // an interrupted app.quit()/Command+Q request through window-all-closed.
        window!.close()
      }
      else { closing = false; await dialog.showMessageBox(window!, { type: 'error', message: 'Your edits could not be saved.', detail: 'The app will stay open. Resolve the save error and try closing again.', buttons: ['Keep working'] }) }
    })()
  })
  if (developmentUrl) await window.loadURL(developmentUrl)
  else await window.loadFile(rendererFile)
  if (startupError) await dialog.showMessageBox(window, { type: 'error', message: startupError })
}
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus() })
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Unable to open Cards Under Glass', String(error)); app.exit(1) })
  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => library?.close())
}
