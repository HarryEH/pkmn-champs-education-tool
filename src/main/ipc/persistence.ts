/**
 * Disk persistence handlers (plan §2, spec §6). Hand-rolled JSON in
 * app.getPath('userData') for explicit control:
 *   teams.json, settings.json, cache/usage-<format>-<month>.json
 *
 * Registered once from main.ts via registerPersistenceHandlers().
 */
import { app, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { IPC } from '../../shared/ipc';
import type { MyTeam, Settings, UsageData } from '../../shared/types';

function userDataDir(): string {
  return app.getPath('userData');
}

function teamsPath(): string {
  return path.join(userDataDir(), 'teams.json');
}

function settingsPath(): string {
  return path.join(userDataDir(), 'settings.json');
}

function cacheDir(): string {
  return path.join(userDataDir(), 'cache');
}

export function usagePath(format: string, month: string): string {
  return path.join(cacheDir(), `usage-${format}-${month}.json`);
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export function registerPersistenceHandlers(): void {
  ipcMain.handle(IPC.teamsLoad, async (): Promise<MyTeam[]> => {
    return readJson<MyTeam[]>(teamsPath(), []);
  });

  ipcMain.handle(IPC.teamsSave, async (_e, teams: MyTeam[]): Promise<void> => {
    await writeJson(teamsPath(), teams);
  });

  ipcMain.handle(IPC.teamsDelete, async (_e, id: string): Promise<void> => {
    const teams = await readJson<MyTeam[]>(teamsPath(), []);
    await writeJson(
      teamsPath(),
      teams.filter((t) => t.id !== id),
    );
  });

  ipcMain.handle(IPC.settingsLoad, async (): Promise<Settings> => {
    return readJson<Settings>(settingsPath(), {});
  });

  ipcMain.handle(IPC.settingsSave, async (_e, settings: Settings): Promise<void> => {
    await writeJson(settingsPath(), settings);
  });

  ipcMain.handle(
    IPC.usageRead,
    async (_e, format: string, month: string): Promise<UsageData | null> => {
      return readJson<UsageData | null>(usagePath(format, month), null);
    },
  );

  ipcMain.handle(IPC.usageWrite, async (_e, data: UsageData): Promise<void> => {
    await writeJson(usagePath(data.format, data.month), data);
  });

  ipcMain.handle(IPC.usageClear, async (_e, format?: string): Promise<void> => {
    try {
      const entries = await fs.readdir(cacheDir());
      const prefix = format ? `usage-${format}-` : 'usage-';
      await Promise.all(
        entries
          .filter((f) => f.startsWith(prefix))
          .map((f) => fs.rm(path.join(cacheDir(), f), { force: true })),
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  });
}
