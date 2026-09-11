import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api, ArchiveProgress, SiteProgress } from '../shared/contracts'
const api: Api = {
  info: () => ipcRenderer.invoke('library:info'),
  chooseLibrary: create => ipcRenderer.invoke('library:choose', create),
  configure: setup => ipcRenderer.invoke('library:configure', setup),
  list: offset => ipcRenderer.invoke('cards:list', offset),
  get: id => ipcRenderer.invoke('cards:get', id),
  create: () => ipcRenderer.invoke('cards:create'),
  save: (id, revision, metadata) => ipcRenderer.invoke('cards:save', id, revision, metadata),
  saveInspection: (id, revision, inspection) => ipcRenderer.invoke('inspection:save', id, revision, inspection),
  setIncludePublic: (id, revision, include) => ipcRenderer.invoke('cards:include-public', id, revision, include),
  addMarker: (cardId, side, x, y) => ipcRenderer.invoke('markers:add', cardId, side, x, y),
  saveMarker: (id, note) => ipcRenderer.invoke('markers:save', id, note),
  removeMarker: id => ipcRenderer.invoke('markers:remove', id),
  choosePhotos: (cardId, slot) => ipcRenderer.invoke('photos:choose', cardId, slot),
  importDroppedPhotos: (cardId, slot, files) => ipcRenderer.invoke('photos:import', cardId, slot, Array.from(files, file => webUtils.getPathForFile(file))),
  savePhotoTitle: (id, title) => ipcRenderer.invoke('photos:title', id, title),
  setPhotoLocked: (id, locked) => ipcRenderer.invoke('photos:lock', id, locked),
  setPhotoMarkers: (id, markerIds) => ipcRenderer.invoke('photos:markers', id, markerIds),
  removePhoto: id => ipcRenderer.invoke('photos:remove', id),
  finalize: (id, revision) => ipcRenderer.invoke('cards:finalize', id, revision),
  delete: id => ipcRenderer.invoke('cards:delete', id),
  createArchive: () => ipcRenderer.invoke('archive:create'),
  restoreArchive: () => ipcRenderer.invoke('archive:restore'),
  onArchiveProgress: callback => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ArchiveProgress): void => callback(progress)
    ipcRenderer.on('archive:progress', handler)
    return () => ipcRenderer.removeListener('archive:progress', handler)
  },
  publicSiteSettings: () => ipcRenderer.invoke('site:settings'),
  choosePublicSiteFolder: () => ipcRenderer.invoke('site:choose-output'),
  generatePublicSite: mode => ipcRenderer.invoke('site:generate', mode),
  onSiteProgress: callback => {
    const handler = (_event: Electron.IpcRendererEvent, progress: SiteProgress): void => callback(progress)
    ipcRenderer.on('site:progress', handler)
    return () => ipcRenderer.removeListener('site:progress', handler)
  },
  onFlush: callback => {
    const handler = async () => {
      let ok = false
      try { ok = await callback() } catch { /* Main keeps the app open on failure. */ }
      await ipcRenderer.invoke('app:flushed', ok)
    }
    ipcRenderer.on('app:flush', handler)
    return () => ipcRenderer.removeListener('app:flush', handler)
  }
}
contextBridge.exposeInMainWorld('cards', api)
