const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aegisops', {
  platform: process.platform,
  version: '1.1.0',
});
