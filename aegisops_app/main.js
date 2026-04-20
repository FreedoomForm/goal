const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('./server/index');

const EXPRESS_PORT = 18090;

// ═══ FIX: Windows DPI blur ═══
// On Windows with display scaling (125%, 150%), Electron/Chromium renders at
// a lower resolution and then upscales, causing the "blur" effect — especially
// visible on the planning page canvas, text, and icons.
// Setting DPI awareness BEFORE app.ready ensures Chromium renders at native
// resolution and lets Windows handle any compositor scaling.
if (process.platform === 'win32') {
  // Per-monitor V2 DPI awareness — crispest rendering on HiDPI/multi-monitor
  app.commandLine.appendSwitch('enable-features', 'CalculateNativeWinOcclusion');
  // Force the renderer to use the device's actual scale factor
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
}

let mainWindow;
let serverInstance;

// NOTE: Hardware acceleration is kept ENABLED for proper backdrop-filter & blur rendering.
// Previously disabled for compatibility, but this caused the planning page blur bug on Windows.
// If GPU issues arise on specific hardware, users can launch with --disable-gpu flag instead.
// app.disableHardwareAcceleration();

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
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    // Ensure smooth rendering for backdrop-filter and CSS effects
    show: false,
  });

  // Wait for content to be ready before showing to avoid blank/blur flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
    // Show user-friendly error instead of raw stack trace
    dialog.showErrorBox(
      'AegisOps — Ошибка запуска',
      `Не удалось запустить сервер: ${err.message}\n\nПопробуйте перезапустить приложение.`
    );
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
