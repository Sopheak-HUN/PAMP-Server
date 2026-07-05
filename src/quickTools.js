'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const versions = require('./versionManager');
const php = require('./phpManager');
const { byId } = require('./toolsConfig');

const PHP = byId('php');

// key ('phpinfo' | 'pma') -> { proc, url } for the php -S servers we launch, so
// repeated clicks reuse a live one instead of spawning duplicates.
const servers = new Map();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function phpExe(root) {
  const exe = versions.currentExe(root, PHP);
  if (!exe) throw new Error('No active PHP version. Activate one first.');
  return exe;
}

/* ---------------- http helpers (redirect-aware) ---------------- */

function httpGet(url, redirects = 8) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'PAMP/0.1 (Windows)' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        resolve(httpGet(new URL(res.headers.location, url).toString(), redirects - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
  });
}

async function fetchJson(url) {
  const res = await httpGet(url);
  let data = '';
  res.setEncoding('utf8');
  await new Promise((resolve, reject) => {
    res.on('data', (c) => { data += c; });
    res.on('end', resolve);
    res.on('error', reject);
  });
  return JSON.parse(data);
}

async function download(url, dest, onProgress) {
  const res = await httpGet(url);
  const total = Number(res.headers['content-length']) || 0;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    let received = 0;
    const out = fs.createWriteStream(dest);
    res.on('data', (c) => { received += c.length; if (onProgress) onProgress({ phase: 'download', received, total }); });
    res.pipe(out);
    res.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
  });
}

function extractZip(zip, dest) {
  return new Promise((resolve, reject) => {
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(dest)} -Force`],
    { windowsHide: true, timeout: 600000, maxBuffer: 10 * 1024 * 1024 },
    (err, _o, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()));
  });
}

/* ---------------- php built-in server ---------------- */

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Serve docRoot with `php -S` and return the URL to open. One server per key is
// kept alive and reused; it's cleaned up on app quit via stopServers().
async function serveDir(root, key, docRoot, openFile) {
  const rec = servers.get(key);
  if (rec && rec.proc.exitCode === null) return `${rec.url}/${openFile}`;

  const exe = phpExe(root);
  const port = await freePort();
  const proc = spawn(exe, ['-S', `127.0.0.1:${port}`, '-t', docRoot], { cwd: docRoot, windowsHide: true });
  const url = `http://127.0.0.1:${port}`;
  servers.set(key, { proc, url });
  proc.on('exit', () => { if (servers.get(key) && servers.get(key).proc === proc) servers.delete(key); });
  proc.on('error', () => servers.delete(key));
  await sleep(500); // give the listener a moment to bind
  return `${url}/${openFile}`;
}

function stopServers() {
  for (const { proc } of servers.values()) { try { proc.kill(); } catch { /* already gone */ } }
  servers.clear();
}

/* ---------------- phpinfo() ---------------- */

async function phpinfo(root) {
  const dir = path.join(os.tmpdir(), 'pamp-phpinfo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.php'), '<?php phpinfo();\n');
  return serveDir(root, 'phpinfo', dir, 'index.php');
}

/* ---------------- composer ---------------- */

function composerPhar(root) { return path.join(root, 'bin', 'composer', 'composer.phar'); }

function composerVersion(root) {
  return new Promise((resolve) => {
    execFile(phpExe(root), [composerPhar(root), '--version', '--no-ansi'],
      { windowsHide: true, timeout: 30000 }, (_err, stdout) => {
        const m = (stdout || '').match(/Composer(?:\s+version)?\s+([\d.]+)/i);
        resolve(m ? m[1] : null);
      });
  });
}

async function composerStatus(root) {
  const phar = composerPhar(root);
  if (!fs.existsSync(phar)) return { installed: false };
  return { installed: true, path: phar, version: await composerVersion(root) };
}

async function installComposer(root, onProgress) {
  phpExe(root); // fail early if no PHP
  const phar = composerPhar(root);
  fs.mkdirSync(path.dirname(phar), { recursive: true });
  await download('https://getcomposer.org/composer-stable.phar', phar, onProgress);
  // A .bat wrapper so `composer` works from a terminal; it calls PHP through the
  // stable junction path, so it keeps working across version switches.
  const phpJunction = path.join(root, 'bin', 'php', 'current', 'php.exe');
  fs.writeFileSync(path.join(root, 'bin', 'composer', 'composer.bat'),
    `@echo off\r\n"${phpJunction}" "%~dp0composer.phar" %*\r\n`);
  return { version: await composerVersion(root), path: phar };
}

/* ---------------- laravel ---------------- */

async function createLaravel(root, opts, onLog) {
  const exe = phpExe(root);
  const name = (opts && opts.name || '').trim();
  if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error('Enter a valid project name (no path separators).');

  if (!fs.existsSync(composerPhar(root))) {
    onLog('Composer not found — installing it first...');
    await installComposer(root, () => {});
  }

  const parent = (opts && opts.dir) || path.join(root, 'www');
  fs.mkdirSync(parent, { recursive: true });
  const target = path.join(parent, name);
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error(`${target} already exists.`);

  onLog(`Creating Laravel project at ${target} ...`);
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, [composerPhar(root), 'create-project', 'laravel/laravel', target, '--no-interaction'],
      { cwd: parent, windowsHide: true });
    const pipe = (d) => d.toString().split(/\r?\n/).forEach((l) => l.trim() && onLog(l));
    proc.stdout.on('data', pipe);
    proc.stderr.on('data', pipe);
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) { onLog('Done. Run "php artisan serve" inside the project to start it.'); resolve({ path: target }); }
      else reject(new Error(`composer exited with code ${code}.`));
    });
  });
}

/* ---------------- phpMyAdmin ---------------- */

function pmaBase(root) { return path.join(root, 'bin', 'phpmyadmin'); }

function findPmaDir(root) {
  const base = pmaBase(root);
  if (fs.existsSync(path.join(base, 'index.php'))) return base;
  try {
    const sub = fs.readdirSync(base, { withFileTypes: true })
      .find((e) => e.isDirectory() && /phpmyadmin/i.test(e.name));
    if (sub && fs.existsSync(path.join(base, sub.name, 'index.php'))) return path.join(base, sub.name);
  } catch { /* not downloaded yet */ }
  return null;
}

// Minimal config so phpMyAdmin connects to PAMP's MySQL (127.0.0.1:3306, root
// with an empty password — the local-dev default PAMP initializes MySQL with).
function writePmaConfig(dir) {
  const cfg = path.join(dir, 'config.inc.php');
  if (fs.existsSync(cfg)) return;
  const secret = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(cfg, `<?php
declare(strict_types=1);
$cfg['blowfish_secret'] = '${secret}';
$i = 0;
$i++;
$cfg['Servers'][$i]['host'] = '127.0.0.1';
$cfg['Servers'][$i]['port'] = 3306;
$cfg['Servers'][$i]['auth_type'] = 'cookie';
$cfg['Servers'][$i]['AllowNoPassword'] = true;
`);
}

async function ensurePhpMyAdmin(root, onProgress) {
  let dir = findPmaDir(root);
  if (!dir) {
    const info = await fetchJson('https://www.phpmyadmin.net/home_page/version.json');
    const version = info.version;
    if (!version) throw new Error('Could not determine the latest phpMyAdmin version.');
    const url = `https://files.phpmyadmin.net/phpMyAdmin/${version}/phpMyAdmin-${version}-all-languages.zip`;
    const base = pmaBase(root);
    fs.mkdirSync(base, { recursive: true });
    const tmp = path.join(os.tmpdir(), `pamp-pma-${version}.zip`);
    await download(url, tmp, onProgress);
    if (onProgress) onProgress({ phase: 'extract' });
    await extractZip(tmp, base);
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    dir = findPmaDir(root);
    if (!dir) throw new Error('phpMyAdmin was extracted but its folder could not be found.');
  }
  writePmaConfig(dir);
  return dir;
}

async function openPhpMyAdmin(root, onProgress) {
  // phpMyAdmin needs these; enabling is a no-op if the DLLs are already on.
  for (const ext of ['mysqli', 'mbstring', 'openssl']) {
    try { php.setExtension(root, ext, true); } catch { /* best effort */ }
  }
  const dir = await ensurePhpMyAdmin(root, onProgress);
  return serveDir(root, 'pma', dir, 'index.php');
}

module.exports = {
  phpinfo,
  composerStatus,
  installComposer,
  createLaravel,
  openPhpMyAdmin,
  stopServers,
  download,
  extractZip,
};
