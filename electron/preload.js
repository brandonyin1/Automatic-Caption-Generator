'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit surface exposed to the page - no direct fs/ipcRenderer
// access, matching the app's existing security posture (contextIsolation on,
// nodeIntegration off). The page only ever sees plain data and callbacks.
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // cb receives an array of { name, buffer, type, lastModified } - one entry
  // per file opened via Send To (or passed on the command line at launch).
  onFilesOpened(cb) {
    ipcRenderer.on('files-opened', (_event, payload) => cb(payload));
  },

  sendTo: {
    status: () => ipcRenderer.invoke('send-to:status'),
    register: () => ipcRenderer.invoke('send-to:register'),
    unregister: () => ipcRenderer.invoke('send-to:unregister')
  }
});
