import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerPersistenceHandlers } from './main/ipc/persistence';
import { registerMediaHandlers, requestCameraAccess } from './main/media';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#F7F8FA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // DevTools in development only.
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
};

// IPC handlers can be registered before the window exists.
registerPersistenceHandlers();
registerMediaHandlers();

app.on('ready', async () => {
  // Prompt for camera access (macOS) before the renderer calls getUserMedia.
  await requestCameraAccess();
  createWindow();
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
