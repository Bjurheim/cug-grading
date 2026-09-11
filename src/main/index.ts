import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Library, validatePhotoSlot } from './library'
import { writePhotoThumbnail } from './photos'
import { createLibraryArchive, inspectLibraryArchive, restoreLibraryArchive } from './archive'
import { generatePublicSite } from './public-site'
import type { Result } from '../shared/contracts'

if (process.argv.includes('--cug-test') && process.env.CUG_TEST_PROFILE) app.setPath('userData', process.env.CUG_TEST_PROFILE)
protocol.registerSchemesAsPrivileged([{ scheme: 'cug-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
interface Preferences { installationId: string; libraryFolder?: string; publicSiteFolders?: Record<string, string>; lastPhotoImportDirectory?: string }
let preferences: Preferences
let library: Library | undefined
let window: BrowserWindow | undefined
let closeAllowed = false
let closing = false
let finishFlush: ((ok: boolean) => void) | undefined
let libraryOperation: 'create' | 'restore' | 'site' | undefined
let libraryOperationCompletion: Promise<void> | undefined
let finishLibraryOperation: (() => void) | undefined
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
function register(channel: string, handler: (...args: unknown[]) => unknown, mutatesLibrary = false): void {
  ipcMain.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
    try {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== trustedUrl()) throw new Error('Untrusted request.')
      if (mutatesLibrary && libraryOperation) throw new Error(`The library is busy ${libraryOperation === 'create' ? 'creating an archive' : libraryOperation === 'restore' ? 'restoring an archive' : 'generating the public site'}.`)
      return { ok: true, value: await handler(...args) }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Operation failed.' } }
  })
}
async function runLibraryOperation<T>(operation: 'create' | 'restore' | 'site', task: () => Promise<T>): Promise<T> {
  if (libraryOperation) throw new Error('Another library operation is already running.')
  libraryOperation = operation
  libraryOperationCompletion = new Promise(resolve => { finishLibraryOperation = resolve })
  try { return await task() }
  finally {
    const finish = finishLibraryOperation
    libraryOperation = undefined; libraryOperationCompletion = undefined; finishLibraryOperation = undefined
    finish?.()
  }
}
function overlaps(first: string, second: string): boolean {
  const child = relative(resolve(first), resolve(second))
  return !child || (!child.startsWith('..') && !isAbsolute(child))
}
function publicSiteFolder(): string | null {
  const info = active().info()
  return preferences.publicSiteFolders?.[info.libraryId] ?? null
}
function validateSiteDestination(folder: string): void {
  if (!folder || typeof folder !== 'string') throw new Error('Choose a public-site output folder.')
  const current = active().folder
  if (overlaps(current, folder) || overlaps(folder, current)) throw new Error('Choose a public-site folder outside the active library.')
}
function rememberPublicSiteFolder(folder: string): void {
  const libraryId = active().info().libraryId
  persistPreferences({ ...preferences, publicSiteFolders: { ...preferences.publicSiteFolders, [libraryId]: resolve(folder) } })
}
function photoPickerDefaultPath(): string | undefined {
  const folder = preferences.lastPhotoImportDirectory
  if (!folder || !isAbsolute(folder)) return undefined
  try { return statSync(folder).isDirectory() ? folder : undefined }
  catch { return undefined }
}
function rememberPhotoImportDirectory(file: string): void {
  const folder = dirname(resolve(file))
  try {
    if (statSync(folder).isDirectory()) persistPreferences({ ...preferences, lastPhotoImportDirectory: folder })
  } catch (error) {
    // Remembering a convenience path must not make an already successful photo
    // import appear to have failed or encourage the user to import it twice.
    console.warn('Could not remember the photo import directory.', error)
  }
}
async function start(): Promise<void> {
  if (existsSync(preferencesPath())) {
    preferences = JSON.parse(readFileSync(preferencesPath(), 'utf8')) as Preferences
    if (!/^[0-9a-f-]{36}$/i.test(preferences.installationId) || (preferences.publicSiteFolders !== undefined && (!preferences.publicSiteFolders || typeof preferences.publicSiteFolders !== 'object' || Array.isArray(preferences.publicSiteFolders) || Object.entries(preferences.publicSiteFolders).some(([id, folder]) => !/^[0-9a-f-]{36}$/i.test(id) || typeof folder !== 'string' || !folder.trim() || folder.length > 4096))) || (preferences.lastPhotoImportDirectory !== undefined && (typeof preferences.lastPhotoImportDirectory !== 'string' || !preferences.lastPhotoImportDirectory.trim() || preferences.lastPhotoImportDirectory.length > 4096))) throw new Error('Installation settings are invalid. Restore preferences.json before continuing.')
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
  }, true)
  register('library:configure', setup => active().configure(setup), true)
  register('cards:list', offset => active().list(offset))
  register('cards:get', id => active().get(id))
  register('cards:create', () => active().create(), true)
  register('cards:save', (id, revision, metadata) => active().save(id, revision, metadata), true)
  register('inspection:save', (id, revision, inspection) => active().saveInspection(id, revision, inspection), true)
  register('cards:include-public', (id, revision, include) => active().setIncludePublic(id, revision, include), true)
  register('markers:add', (cardId, side, x, y) => active().addMarker(cardId, side, x, y), true)
  register('markers:save', (id, note) => active().saveMarker(id, note), true)
  register('markers:remove', id => active().removeMarker(id), true)
  register('photos:choose', async (cardId, slot) => {
    validatePhotoSlot(slot)
    active().get(cardId)
    const defaultPath = photoPickerDefaultPath()
    const selected = await dialog.showOpenDialog(window!, {
      title: slot === null ? 'Add photos' : 'Choose a photo',
      properties: slot === null ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      ...(defaultPath ? { defaultPath } : {})
    })
    if (selected.canceled || !selected.filePaths.length) return null
    const detail = await active().importPhotos(cardId, slot, selected.filePaths)
    rememberPhotoImportDirectory(selected.filePaths[0])
    return detail
  }, true)
  register('photos:import', (cardId, slot, paths) => active().importPhotos(cardId, slot, paths), true)
  register('photos:title', (id, title) => active().savePhotoTitle(id, title), true)
  register('photos:lock', (id, locked) => active().setPhotoLocked(id, locked), true)
  register('photos:markers', (id, markerIds) => active().setPhotoMarkers(id, markerIds), true)
  register('photos:remove', id => active().removePhoto(id), true)
  register('cards:finalize', (id, revision) => active().finalize(id, revision), true)
  register('cards:delete', id => active().delete(id), true)
  register('archive:create', () => runLibraryOperation('create', async () => {
    const selected = await dialog.showSaveDialog(window!, {
      title: 'Create Library Archive',
      defaultPath: `CardsUnderGlass-${new Date().toISOString().slice(0, 10)}.cug`,
      filters: [{ name: 'Cards Under Glass Library Archive', extensions: ['cug'] }]
    })
    if (selected.canceled || !selected.filePath) return null
    const destination = selected.filePath.toLowerCase().endsWith('.cug') ? selected.filePath : `${selected.filePath}.cug`
    await createLibraryArchive(active(), destination, app.getVersion(), progress => window?.webContents.send('archive:progress', progress))
    return { filename: basename(destination) }
  }))
  register('archive:restore', () => runLibraryOperation('restore', async () => {
    const archiveSelection = await dialog.showOpenDialog(window!, {
      title: 'Choose a Cards Under Glass Library Archive', properties: ['openFile'],
      filters: [{ name: 'Cards Under Glass Library Archive', extensions: ['cug'] }]
    })
    if (archiveSelection.canceled || !archiveSelection.filePaths[0]) return null
    const archivePath = archiveSelection.filePaths[0]
    window?.webContents.send('archive:progress', { operation: 'restore', stage: 'validating' })
    const inspected = await inspectLibraryArchive(archivePath)
    const destinationSelection = await dialog.showOpenDialog(window!, { title: 'Choose a new or empty folder for the restored library', properties: ['openDirectory', 'createDirectory'] })
    if (destinationSelection.canceled || !destinationSelection.filePaths[0]) return null
    const destination = destinationSelection.filePaths[0]
    const current = active()
    if (overlaps(current.folder, destination) || overlaps(destination, current.folder)) throw new Error('Restore into a separate new or empty folder outside the active library.')
    const confirmation = await dialog.showMessageBox(window!, {
      type: 'warning',
      message: `Restore ${basename(archivePath)}?`,
      detail: `A complete library will be restored into ${destination}, then the app will switch to it after validation. Nothing will be merged. Continue using only one copy with this installation identity to avoid overlapping future serials.`,
      buttons: ['Cancel', 'Restore and open'], defaultId: 1, cancelId: 0, noLink: true
    })
    if (confirmation.response !== 1) return null
    const manifest = await restoreLibraryArchive(archivePath, destination, progress => window?.webContents.send('archive:progress', progress))
    if (manifest.library.id !== inspected.manifest.library.id) throw new Error('Archive identity changed during restore. The restored files were not opened.')
    const candidate = new Library(destination, manifest.originatingInstallation.id, false, writePhotoThumbnail)
    try { persistPreferences({ ...preferences, installationId: manifest.originatingInstallation.id, libraryFolder: destination }) }
    catch (error) { candidate.close(); throw error }
    library = candidate
    try { current.close() } catch { /* The restored library is already validated and active. */ }
    return { filename: basename(archivePath), info: candidate.info() }
  }))
  register('site:settings', () => ({ outputFolder: publicSiteFolder() }))
  register('site:choose-output', async () => {
    const selected = await dialog.showOpenDialog(window!, {
      title: 'Choose a folder for the generated public site',
      defaultPath: publicSiteFolder() ?? undefined,
      properties: ['openDirectory', 'createDirectory']
    })
    if (selected.canceled || !selected.filePaths[0]) return null
    const folder = resolve(selected.filePaths[0])
    validateSiteDestination(folder)
    rememberPublicSiteFolder(folder)
    return { outputFolder: folder }
  })
  register('site:generate', mode => runLibraryOperation('site', async () => {
    if (mode !== 'update' && mode !== 'rebuild') throw new Error('Invalid public-site generation mode.')
    let destination = publicSiteFolder()
    if (!destination) {
      const selected = await dialog.showOpenDialog(window!, { title: 'Choose a folder for the generated public site', properties: ['openDirectory', 'createDirectory'] })
      if (selected.canceled || !selected.filePaths[0]) return null
      destination = resolve(selected.filePaths[0])
      validateSiteDestination(destination)
      rememberPublicSiteFolder(destination)
    }
    validateSiteDestination(destination)
    return generatePublicSite(active(), destination, app.getVersion(), progress => window?.webContents.send('site:progress', progress), undefined, { mode })
  }))
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
        // Do not terminate staged archive/restore/site work halfway through. Command+Q
        // and ordinary close complete automatically as soon as that operation ends.
        const pendingLibraryOperation = libraryOperationCompletion
        if (pendingLibraryOperation) await pendingLibraryOperation
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
