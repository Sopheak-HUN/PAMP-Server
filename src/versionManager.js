'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// exe path + mtime -> detected version string, so refreshes don't re-spawn exes
const versionCache = new Map();

function toolRoot(root, toolId) {
  return path.join(root, 'bin', toolId);
}

function ensureToolDirs(root, tools) {
  for (const t of tools) fs.mkdirSync(toolRoot(root, t.id), { recursive: true });
}

function norm(p) {
  return path.resolve(p).toLowerCase().replace(/[\\/]+$/, '');
}

// Locate the tool exe inside a version folder. Zips often extract into a
// nested folder (bin/php/8.3/php-8.3.1-Win32/php.exe), so also look one
// level deep. Returns { exe, base } where base is the folder the junction
// should point at, or null if this folder holds no valid install.
function findExe(dir, tool) {
  for (const rel of tool.exe) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return { exe: p, base: dir };
  }
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { /* ignore */ }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    for (const rel of tool.exe) {
      const p = path.join(dir, e.name, rel);
      if (fs.existsSync(p)) return { exe: p, base: path.join(dir, e.name) };
    }
  }
  return null;
}

function detectVersion(exe, tool) {
  let key;
  try { key = `${exe}|${fs.statSync(exe).mtimeMs}`; } catch { return Promise.resolve(null); }
  if (versionCache.has(key)) return Promise.resolve(versionCache.get(key));

  return new Promise((resolve) => {
    execFile(exe, tool.versionArgs, { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
      const out = `${stdout || ''}\n${stderr || ''}`;
      const re = tool.versionRegex ? new RegExp(tool.versionRegex) : /(\d+\.\d+(?:\.\d+)?)/;
      const m = out.match(re);
      const version = m ? (m[1] || m[0]) : null;
      if (version) versionCache.set(key, version);
      resolve(version);
    });
  });
}

// Resolve where the "current" junction points, or null if not set/broken.
function getActiveTarget(root, toolId) {
  try {
    return fs.realpathSync(path.join(toolRoot(root, toolId), 'current'));
  } catch {
    return null;
  }
}

async function listVersions(root, tool) {
  const dir = toolRoot(root, tool.id);
  fs.mkdirSync(dir, { recursive: true });
  const active = getActiveTarget(root, tool.id);
  const result = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.toLowerCase() === 'current') continue;
    const vdir = path.join(dir, e.name);
    const found = findExe(vdir, tool);
    const version = found ? await detectVersion(found.exe, tool) : null;
    const isActive = !!(active && found &&
      (norm(active) === norm(found.base) || norm(active) === norm(vdir)));
    result.push({
      name: e.name,
      dir: vdir,
      valid: !!found,
      version,
      active: isActive,
    });
  }
  return result;
}

// Point bin/<tool>/current at the chosen version via a directory junction
// (junctions don't need admin rights on Windows).
function setActive(root, tool, versionName) {
  const dir = toolRoot(root, tool.id);
  const vdir = path.join(dir, versionName);
  const found = findExe(vdir, tool);
  if (!found) {
    throw new Error(`No ${tool.exe[0]} found under ${vdir}. Extract a ${tool.name} build into that folder first.`);
  }
  const cur = path.join(dir, 'current');
  try { fs.rmdirSync(cur); } catch { try { fs.unlinkSync(cur); } catch { /* not there */ } }
  fs.symlinkSync(found.base, cur, 'junction');
  return found.base;
}

// Absolute path of the active exe (through the junction), or null.
function currentExe(root, tool) {
  const cur = path.join(toolRoot(root, tool.id), 'current');
  for (const rel of tool.exe) {
    const p = path.join(cur, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function currentDir(root, tool) {
  const cur = path.join(toolRoot(root, tool.id), 'current');
  return fs.existsSync(cur) ? cur : null;
}

module.exports = {
  toolRoot,
  ensureToolDirs,
  listVersions,
  setActive,
  currentExe,
  currentDir,
  getActiveTarget,
};
