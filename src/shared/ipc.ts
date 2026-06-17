/**
 * IPC contract — the single source of truth for channel names and payload
 * types (spec §6, plan §2). FROZEN after Phase 0.
 *
 * Main implements handlers (ipcMain.handle); preload implements thin typed
 * wrappers exposed as window.api. No raw ipcRenderer.invoke('string') anywhere
 * else in the codebase.
 */
import type { DetectionLabel, MyTeam, Settings, UsageData } from './types';

export const IPC = {
  teamsLoad: 'teams:load',
  teamsSave: 'teams:save',
  teamsDelete: 'teams:delete',
  settingsLoad: 'settings:load',
  settingsSave: 'settings:save',
  usageRead: 'usage:read',
  usageWrite: 'usage:write',
  usageClear: 'usage:clear',
  usageFetch: 'usage:fetch',
  mediaRequestCamera: 'media:requestCamera',
  labelsLoad: 'labels:load',
  labelsAppend: 'labels:append',
  labelsClear: 'labels:clear',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/**
 * The typed bridge exposed on `window.api` by the preload script. Every
 * renderer<->main interaction goes through this surface.
 */
export interface Api {
  teams: {
    load(): Promise<MyTeam[]>;
    save(teams: MyTeam[]): Promise<void>;
    delete(id: string): Promise<void>;
  };
  settings: {
    load(): Promise<Settings>;
    save(settings: Settings): Promise<void>;
  };
  usage: {
    /** Returns cached usage for a format, or null on miss. */
    read(format: string, month: string): Promise<UsageData | null>;
    write(data: UsageData): Promise<void>;
    /** Clears cache for one format (all months) or everything. */
    clear(format?: string): Promise<void>;
    /**
     * Fetch + normalize Smogon usage for a format, read-through the disk cache.
     * Runs in MAIN (Node) because the source (smogon.com) sends no CORS headers,
     * so the renderer cannot fetch it directly. Never throws — degrades to cache
     * or an empty-but-valid UsageData. `refresh` forces a network re-fetch.
     */
    fetch(format: string, options?: { refresh?: boolean }): Promise<UsageData>;
  };
  media: {
    /** macOS camera permission prompt; resolves true if granted. */
    requestCamera(): Promise<boolean>;
  };
  labels: {
    /** All persisted label-as-you-go detection exemplars. */
    load(): Promise<DetectionLabel[]>;
    /** Append one captured exemplar (read-modify-write). */
    append(label: DetectionLabel): Promise<void>;
    /** Delete every captured exemplar. */
    clear(): Promise<void>;
  };
}

declare global {
  interface Window {
    api: Api;
  }
}
