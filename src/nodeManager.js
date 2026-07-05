'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const versions = require('./versionManager');
const { byId } = require('./toolsConfig');

const NODE = byId('node');

// The global CLI packages PAMP offers one-click install for. Global npm installs
// land in bin\node\current (npm's prefix on Windows is the node folder), which is
// already on PATH via pathDirs [''], so the binaries "just work" in a terminal.
const PACKAGES = [
  { name: 'yarn', logo: 'yarn', desc: 'Package manager' },
  { name: 'pnpm', logo: 'pnpm', desc: 'Fast, disk-efficient PM' },
  { name: 'bun', logo: 'bun', desc: 'All-in-one toolkit' },
  { name: 'pm2', logo: 'pm2', desc: 'Process manager' },
  { name: 'typescript', logo: 'typescript', desc: 'tsc compiler' },
  { name: 'vite', logo: 'vite', desc: 'Build tool & dev server' },
];
const KNOWN = new Set(PACKAGES.map((p) => p.name));

// Run npm through `node npm-cli.js` rather than npm.cmd, so we don't need a
// shell (spawning .cmd files needs shell:true and quoting care on Windows).
function npmCtx(root) {
  const exe = versions.currentExe(root, NODE);
  const dir = versions.currentDir(root, NODE);
  if (!exe || !dir) return null;
  const cli = path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(cli)) return null;
  return { exe, dir, cli };
}

function listGlobals(ctx) {
  return new Promise((resolve) => {
    execFile(ctx.exe, [ctx.cli, 'ls', '-g', '--depth=0', '--json'],
      { cwd: ctx.dir, windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
      (_err, stdout) => {
        // npm can exit non-zero (peer-dep noise) yet still print valid JSON.
        const map = new Map();
        try {
          const deps = (JSON.parse(stdout || '{}').dependencies) || {};
          for (const [name, meta] of Object.entries(deps)) map.set(name, (meta && meta.version) || null);
        } catch { /* leave empty */ }
        resolve(map);
      });
  });
}

async function info(root) {
  const ctx = npmCtx(root);
  if (!ctx) return { available: false };
  const installed = await listGlobals(ctx);
  return {
    available: true,
    dir: ctx.dir,
    packages: PACKAGES.map((p) => ({
      ...p,
      installed: installed.has(p.name),
      version: installed.get(p.name) || null,
    })),
  };
}

function runNpm(root, args, onLog) {
  const ctx = npmCtx(root);
  if (!ctx) throw new Error('No active Node.js version. Activate one first.');
  return new Promise((resolve, reject) => {
    const proc = spawn(ctx.exe, [ctx.cli, ...args], { cwd: ctx.dir, windowsHide: true });
    const pipe = (d) => d.toString().split(/\r?\n/).forEach((l) => l.trim() && onLog(l));
    proc.stdout.on('data', pipe);
    proc.stderr.on('data', pipe);
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm exited with code ${code}.`))));
  });
}

async function install(root, pkg, onLog) {
  if (!KNOWN.has(pkg)) throw new Error(`Unknown package: ${pkg}`);
  onLog(`> npm install -g ${pkg}`);
  await runNpm(root, ['install', '-g', pkg], onLog);
  onLog(`Installed ${pkg}.`);
  return { pkg };
}

async function uninstall(root, pkg, onLog) {
  if (!KNOWN.has(pkg)) throw new Error(`Unknown package: ${pkg}`);
  onLog(`> npm uninstall -g ${pkg}`);
  await runNpm(root, ['uninstall', '-g', pkg], onLog);
  onLog(`Removed ${pkg}.`);
  return { pkg };
}

module.exports = { info, install, uninstall };
