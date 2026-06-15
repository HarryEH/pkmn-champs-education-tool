/**
 * macOS media-access plumbing (spec §9 R3). The renderer's getUserMedia for the
 * Elgato capture device needs camera permission granted at the OS level first;
 * on macOS that means systemPreferences.askForMediaAccess('camera').
 *
 * Keep all platform-specific media code here.
 */
import { ipcMain, systemPreferences } from 'electron';
import { IPC } from '../shared/ipc';

/** Request camera access up front (macOS). No-op / always-true elsewhere. */
export async function requestCameraAccess(): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('camera');
  if (status === 'granted') return true;
  try {
    return await systemPreferences.askForMediaAccess('camera');
  } catch {
    return false;
  }
}

export function registerMediaHandlers(): void {
  ipcMain.handle(IPC.mediaRequestCamera, () => requestCameraAccess());
}
