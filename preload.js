'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pamp', {
  listTools: () => ipcRenderer.invoke('tools:list'),
  activate: (toolId, versionName) => ipcRenderer.invoke('tools:activate', toolId, versionName),
  openDir: (toolId) => ipcRenderer.invoke('tools:openDir', toolId),
  statusAll: () => ipcRenderer.invoke('status:all'),
  startService: (toolId) => ipcRenderer.invoke('service:start', toolId),
  stopService: (toolId) => ipcRenderer.invoke('service:stop', toolId),
  getLogs: (toolId) => ipcRenderer.invoke('logs:get', toolId),
  pathStatus: () => ipcRenderer.invoke('path:status'),
  pathSetup: () => ipcRenderer.invoke('path:setup'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  dlList: (toolId) => ipcRenderer.invoke('dl:list', toolId),
  dlInstall: (toolId, version) => ipcRenderer.invoke('dl:install', toolId, version),
  onDlProgress: (fn) => ipcRenderer.on('dl:progress', (_e, payload) => fn(payload)),
  onLog: (fn) => ipcRenderer.on('service:log', (_e, payload) => fn(payload)),
});
