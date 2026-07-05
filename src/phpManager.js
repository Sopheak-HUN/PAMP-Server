'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const versions = require('./versionManager');
const { byId } = require('./toolsConfig');

const PHP = byId('php');

// Windows PHP zips ship php.ini-development / php.ini-production but no php.ini,
// so nothing is loaded until one exists. Create it from the development
// template on first look so the file the UI shows is real and editable.
function ensureIni(phpDir) {
  const ini = path.join(phpDir, 'php.ini');
  if (fs.existsSync(ini)) return ini;
  for (const src of ['php.ini-development', 'php.ini-production']) {
    const tpl = path.join(phpDir, src);
    if (fs.existsSync(tpl)) {
      try { fs.copyFileSync(tpl, ini); return ini; } catch { /* fall through */ }
    }
  }
  return fs.existsSync(ini) ? ini : null;
}

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

// Pull enabled extensions and the extension_dir / error_log directives out of a
// php.ini. Commented (`;`) lines still tell us an extension *exists* but count
// as disabled.
function parseIni(text) {
  const enabled = new Set();
  let extDir = null;
  let errorLog = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const commented = line.startsWith(';');
    const body = commented ? line.replace(/^;+\s*/, '') : line;
    let m = body.match(/^(?:zend_extension|extension)\s*=\s*"?(?:php_)?([A-Za-z0-9_]+)(?:\.dll)?"?/i);
    if (m) { if (!commented) enabled.add(m[1].toLowerCase()); continue; }
    if (commented) continue;
    m = body.match(/^extension_dir\s*=\s*"?([^";]+?)"?\s*$/i);
    if (m) { extDir = m[1].trim(); continue; }
    m = body.match(/^error_log\s*=\s*"?([^";]+?)"?\s*$/i);
    if (m) { errorLog = m[1].trim(); }
  }
  return { enabled, extDir, errorLog };
}

function resolveExtDir(directive, phpDir) {
  if (directive) return path.isAbsolute(directive) ? directive : path.join(phpDir, directive);
  return path.join(phpDir, 'ext');
}

function resolveErrorLog(directive, root) {
  if (directive && directive.toLowerCase() !== 'syslog') {
    return path.isAbsolute(directive) ? directive : path.join(root, directive);
  }
  return path.join(root, 'logs', 'php', 'error.log');
}

// The toggleable extensions are the php_*.dll files shipped in ext/.
function listExtDlls(extDir) {
  try {
    return fs.readdirSync(extDir)
      .map((f) => (f.match(/^php_(.+)\.dll$/i) || [])[1])
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}

// `php -m` is the source of truth for what's actually loaded right now.
function loadedModules(exe) {
  return new Promise((resolve) => {
    execFile(exe, ['-m'], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      resolve(stdout.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('[')));
    });
  });
}

// Resolve the config-file locations for the active PHP without spawning php.exe,
// so the "open" handlers stay cheap.
function resolvePaths(root) {
  const dir = versions.currentDir(root, PHP);
  if (!dir) return null;
  const iniPath = ensureIni(dir) || path.join(dir, 'php.ini');
  const parsed = parseIni(fs.existsSync(iniPath) ? safeRead(iniPath) : '');
  return {
    dir,
    iniPath,
    parsed,
    extDir: resolveExtDir(parsed.extDir, dir),
    errorLog: resolveErrorLog(parsed.errorLog, root),
  };
}

async function info(root) {
  const exe = versions.currentExe(root, PHP);
  const paths = resolvePaths(root);
  if (!exe || !paths) return { available: false };

  const loaded = await loadedModules(exe);
  const loadedLc = new Set(loaded.map((m) => m.toLowerCase()));
  const enabledLc = paths.parsed.enabled;
  const extensions = listExtDlls(paths.extDir).map((name) => ({
    name,
    enabled: enabledLc.has(name.toLowerCase()) || loadedLc.has(name.toLowerCase()),
  }));

  return {
    available: true,
    dir: paths.dir,
    iniPath: paths.iniPath,
    iniExists: fs.existsSync(paths.iniPath),
    extDir: paths.extDir,
    extDirExists: fs.existsSync(paths.extDir),
    errorLog: paths.errorLog,
    errorLogExists: fs.existsSync(paths.errorLog),
    loaded,       // canonical loaded-module names (drives the chip list)
    extensions,   // every php_*.dll with its on/off state (drives the manager)
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Enable/disable an extension by rewriting its line in php.ini. opcache is a
// Zend extension, so it takes the zend_extension directive.
function setExtension(root, name, enabled) {
  const dir = versions.currentDir(root, PHP);
  if (!dir) throw new Error('No active PHP version.');
  const iniPath = ensureIni(dir) || path.join(dir, 'php.ini');
  if (!fs.existsSync(iniPath)) throw new Error('php.ini not found for the active PHP version.');

  const directive = /^opcache$/i.test(name) ? 'zend_extension' : 'extension';
  const re = new RegExp(
    `^\\s*;?\\s*(?:zend_extension|extension)\\s*=\\s*"?(?:php_)?${escapeRe(name)}(?:\\.dll)?"?\\s*$`, 'i');

  const lines = fs.readFileSync(iniPath, 'utf8').split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (!re.test(line)) return line;
    found = true;
    return enabled ? `${directive}=${name}` : `;${directive}=${name}`;
  });
  if (!found && enabled) next.push(`${directive}=${name}`);

  fs.writeFileSync(iniPath, next.join('\n'));
  return { name, enabled };
}

// Map a UI target to a real file/folder to reveal, guarding against missing ones.
function openTargetPath(root, which) {
  const paths = resolvePaths(root);
  if (!paths) throw new Error('No active PHP version.');
  const target = { ini: paths.iniPath, extDir: paths.extDir, errorLog: paths.errorLog }[which];
  if (!target) throw new Error(`Unknown target: ${which}`);
  if (!fs.existsSync(target)) {
    if (which === 'errorLog') throw new Error('No PHP error log yet — nothing has been logged.');
    throw new Error(`Not found: ${target}`);
  }
  return target;
}

module.exports = { info, setExtension, openTargetPath, resolvePaths };
