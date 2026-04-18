const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('./server/index');

const EXPRESS_PORT = 18090;

let mainWindow;
let serverInstance;

app.disableHardwareAcceleration(); // For compatibility in some environments

// Resolve writable data directory outside the ASAR archive.
// In packaged apps __dirname points inside app.asar (read-only),
// so we must use Electron's userData path for any writable directories.
function getUserDataDir() {
  return app.getPath('userData');
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#050a15',
    title: 'AegisOps Local AI — Enterprise Integration Platform',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Remove default menu for a cleaner app feel
  Menu.setApplicationMenu(null);

  try {
    console.log('[Electron] Starting internal Express server...');
    serverInstance = await startServer(EXPRESS_PORT, { dataDir: getUserDataDir() });
    console.log(`[Electron] Internal server running on port ${EXPRESS_PORT}`);

    // Load URL from local express
    mainWindow.loadURL(`http://127.0.0.1:${EXPRESS_PORT}`);
  } catch (err) {
    console.error('[Electron] Server failed to start:', err);
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
  }

  // Graceful handling of close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    console.log('[Electron] Shutting down internal server...');
    serverInstance.close();
  }
});
