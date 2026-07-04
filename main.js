'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { TOOLS, byId } = require('./src/toolsConfig');
const versions = require('./src/versionManager');
const services = require('./src/serviceManager');
const pathMgr = require('./src/pathManager');
const settings = require('./src/settingsManager');
const downloads = require('./src/downloadManager');

const fs = require('fs');

// App code and the managed stack can live apart: bin/ and data/ sit at the
// stack root. Resolution order:
//   1. PAMP_ROOT env var (explicit override)
//   2. portable exe: the folder the .exe sits in (electron-builder sets this)
//   3. packaged install: the folder of the executable
//   4. dev: this folder, or its parent (app code in <stack>/PAMP-Server)
const APP_DIR = __dirname;
function resolveRoot() {
  if (process.env.PAMP_ROOT) return process.env.PAMP_ROOT;
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (app.isPackaged) return path.dirname(process.execPath);
  if (fs.existsSync(path.join(APP_DIR, 'bin'))) return APP_DIR;
  if (fs.existsSync(path.join(path.dirname(APP_DIR), 'bin'))) return path.dirname(APP_DIR);
  return APP_DIR;
}
const ROOT = resolveRoot();

// settings.json lives next to the app source in dev; in a packaged build the
// app directory is a read-only asar, so it goes to the stack root instead.
const SETTINGS_DIR = app.isPackaged ? ROOT : APP_DIR;

let win = null;

function createWindow() {
  const s = settings.get(SETTINGS_DIR);
  const isLight = s.theme === 'light';
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: isLight ? '#eef1f6' : '#12141a',
    autoHideMenuBar: true,
    title: 'PAMP — Dev Stack Control Panel',
    icon: path.join(__dirname, 'ui', 'logo.ico'),
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.on('closed', () => { win = null; });
}

services.onLog((toolId, entry) => {
  if (win && !win.isDestroyed()) win.webContents.send('service:log', { toolId, ...entry });
});

function requireTool(toolId) {
  const tool = byId(toolId);
  if (!tool) throw new Error(`Unknown tool: ${toolId}`);
  return tool;
}

// Services run on the port configured in settings (falling back to the
// tool's default); everything downstream just sees tool.port.
function effectiveTool(toolId) {
  const tool = requireTool(toolId);
  if (tool.kind !== 'service' || !tool.port) return tool;
  const p = Math.trunc(Number((settings.get(SETTINGS_DIR).ports || {})[tool.id]));
  return p >= 1 && p <= 65535 ? { ...tool, port: p } : tool;
}

ipcMain.handle('tools:list', async () => {
  versions.ensureToolDirs(ROOT, TOOLS);
  const list = [];
  for (const tool of TOOLS) {
    const vers = await versions.listVersions(ROOT, tool);
    const active = vers.find((v) => v.active) || null;
    list.push({
      id: tool.id,
      name: tool.name,
      kind: tool.kind,
      accent: tool.accent,
      badge: tool.badge,
      port: effectiveTool(tool.id).port || null,
      dir: versions.toolRoot(ROOT, tool.id),
      versions: vers,
      activeVersion: active ? (active.version || active.name) : null,
    });
  }
  return list;
});

ipcMain.handle('tools:activate', async (_e, toolId, versionName) => {
  versions.setActive(ROOT, requireTool(toolId), versionName);
  return true;
});

ipcMain.handle('tools:openDir', async (_e, toolId) => {
  const dir = versions.toolRoot(ROOT, requireTool(toolId).id);
  await shell.openPath(dir);
  return true;
});

ipcMain.handle('status:all', async () => {
  const out = {};
  await Promise.all(
    TOOLS.filter((t) => t.kind === 'service').map(async (t) => {
      out[t.id] = await services.getStatus(effectiveTool(t.id));
    })
  );
  return out;
});

// Folder overrides from settings, resolved at each start.
function serviceOpts() {
  const s = settings.get(SETTINGS_DIR);
  return { dataRoot: s.dataDir || undefined, docRoot: s.documentRoot || undefined };
}

ipcMain.handle('service:start', async (_e, toolId) => services.start(ROOT, effectiveTool(toolId), serviceOpts()));
ipcMain.handle('service:stop', async (_e, toolId) => services.stop(ROOT, effectiveTool(toolId)));
ipcMain.handle('logs:get', async (_e, toolId) => services.getLogs(toolId));
ipcMain.handle('logs:clear', async (_e, toolId) => {
  services.clearLogs(toolId);
  return true;
});

ipcMain.handle('path:status', async () => pathMgr.getStatus(ROOT, TOOLS));
ipcMain.handle('path:setup', async () => pathMgr.setup(ROOT, TOOLS));

// Register (or remove) PAMP in the user's Windows startup entries. In dev the
// login item is "electron.exe <app dir>"; in a packaged build it's the exe.
function applyLoginItem(s) {
  const args = process.defaultApp ? [APP_DIR] : [];
  if (s.runMinimized) args.push('--minimized');
  app.setLoginItemSettings({ openAtLogin: !!s.runAtStartup, path: process.execPath, args });
}

ipcMain.handle('settings:get', async () => settings.get(SETTINGS_DIR));
ipcMain.handle('settings:set', async (_e, patch) => {
  const next = settings.set(SETTINGS_DIR, patch);
  applyLoginItem(next);
  return next;
});

ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.on('win:maximize', () => {
  if (win) {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
});
ipcMain.on('win:close', () => { if (win) win.close(); });
ipcMain.on('shell:openExternal', (_e, url) => { shell.openExternal(url); });

ipcMain.handle('dialog:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dl:list', async (_e, toolId) => downloads.listAvailable(requireTool(toolId)));

ipcMain.handle('dl:install', async (_e, toolId, version) => {
  const tool = requireTool(toolId);
  // Throttle progress: at most ~4 IPC messages/second keeps the UI smooth
  // without flooding the renderer on fast connections.
  let lastSent = 0;
  const onProgress = (p) => {
    const now = Date.now();
    if (p.phase === 'download' && now - lastSent < 250) return;
    lastSent = now;
    if (win && !win.isDestroyed()) {
      win.webContents.send('dl:progress', {
        toolId, version, phase: p.phase,
        received: p.received || 0, total: p.total || 0,
        pct: p.total ? Math.round((p.received / p.total) * 100) : 0,
      });
    }
  };
  return downloads.install(ROOT, tool, version, onProgress);
});

app.whenReady().then(async () => {
  versions.ensureToolDirs(ROOT, TOOLS);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  const s = settings.get(SETTINGS_DIR);
  applyLoginItem(s);
  if (s.runMinimized || process.argv.includes('--minimized')) win.minimize();

  // Laragon-style "Start All automatically": bring up every service that has
  // an active version and isn't already running (e.g. survived last session).
  if (s.autoStartServices) {
    for (const t of TOOLS.filter((x) => x.kind === 'service')) {
      try {
        const et = effectiveTool(t.id);
        const st = await services.getStatus(et);
        if (st.state === 'stopped' && versions.currentExe(ROOT, et)) {
          await services.start(ROOT, et, serviceOpts());
        }
      } catch { /* reported in the service's log buffer */ }
    }
  }
});

app.on('window-all-closed', () => {
  // Services are independent processes and keep running; the app finds them
  // again by port on next launch.
  app.quit();
});
