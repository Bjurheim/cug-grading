import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/contracts'
const api: Api = {
  info: () => ipcRenderer.invoke('library:info'),
  chooseLibrary: create => ipcRenderer.invoke('library:choose', create),
  configure: setup => ipcRenderer.invoke('library:configure', setup),
  list: offset => ipcRenderer.invoke('cards:list', offset),
  create: () => ipcRenderer.invoke('cards:create'),
  save: (id, revision, metadata) => ipcRenderer.invoke('cards:save', id, revision, metadata),
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
