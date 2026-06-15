/**
 * Preload bridge — exposes the typed `window.api` surface (shared/ipc.ts) over
 * contextBridge. Thin wrappers over ipcRenderer.invoke; the ONLY place raw
 * channel strings are used in the renderer-facing world.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type Api } from './shared/ipc';
import type { MyTeam, Settings, UsageData } from './shared/types';

const api: Api = {
  teams: {
    load: () => ipcRenderer.invoke(IPC.teamsLoad),
    save: (teams: MyTeam[]) => ipcRenderer.invoke(IPC.teamsSave, teams),
    delete: (id: string) => ipcRenderer.invoke(IPC.teamsDelete, id),
  },
  settings: {
    load: () => ipcRenderer.invoke(IPC.settingsLoad),
    save: (settings: Settings) => ipcRenderer.invoke(IPC.settingsSave, settings),
  },
  usage: {
    read: (format: string, month: string) => ipcRenderer.invoke(IPC.usageRead, format, month),
    write: (data: UsageData) => ipcRenderer.invoke(IPC.usageWrite, data),
    clear: (format?: string) => ipcRenderer.invoke(IPC.usageClear, format),
  },
  media: {
    requestCamera: () => ipcRenderer.invoke(IPC.mediaRequestCamera),
  },
};

contextBridge.exposeInMainWorld('api', api);
