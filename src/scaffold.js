'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const versions = require('./versionManager');
const { byId } = require('./toolsConfig');
const { npmCtx } = require('./nodeManager');
const { download, extractZip } = require('./quickTools');

const VITE_TEMPLATES = new Set(['vanilla', 'vanilla-ts', 'vue', 'vue-ts', 'react', 'react-ts', 'svelte', 'svelte-ts']);
const DOTNET_TEMPLATES = new Set(['console', 'classlib', 'webapi', 'mvc', 'blazor', 'worker']);

function runStream(exe, args, opts, onLog) {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { windowsHide: true, ...opts });
    const pipe = (d) => d.toString().split(/\r?\n/).forEach((l) => l.trim() && onLog(l));
    proc.stdout.on('data', pipe);
    proc.stderr.on('data', pipe);
    proc.on('error', reject);
    proc.on('exit', (code) =>
      (code === 0 ? resolve() : reject(new Error(`${path.basename(exe)} exited with code ${code}.`))));
  });
}

function checkName(name) {
  const n = (name || '').trim();
  if (!n || /[\\/:*?"<>|\s]/.test(n)) throw new Error('Enter a valid project name (no spaces or path separators).');
  return n;
}

// Resolve (and create) the parent folder, defaulting to <stack>\www like the
// Laravel scaffold, and refuse to write into a non-empty target.
function targetDir(root, opts, name) {
  const parent = (opts && opts.dir) || path.join(root, 'www');
  fs.mkdirSync(parent, { recursive: true });
  const target = path.join(parent, name);
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error(`${target} already exists.`);
  return { parent, target };
}

function runtimeExe(root, toolId, label) {
  const exe = versions.currentExe(root, byId(toolId));
  if (!exe) throw new Error(`No active ${label} version. Activate one first.`);
  return exe;
}

/* ---------------- node: vite ---------------- */

async function createVite(root, opts, onLog) {
  const ctx = npmCtx(root);
  if (!ctx) throw new Error('No active Node.js version. Activate one first.');
  const name = checkName(opts.name);
  const template = VITE_TEMPLATES.has(opts.template) ? opts.template : 'vanilla';
  const { parent, target } = targetDir(root, opts, name);
  onLog(`> npm create vite ${name} -- --template ${template}`);
  await runStream(ctx.exe, [ctx.cli, 'exec', '--yes', '--', 'create-vite@latest', name, '--template', template],
    { cwd: parent }, onLog);
  onLog('Done. Run "npm install" then "npm run dev" inside the project.');
  return { path: target };
}

/* ---------------- python: venv + django ---------------- */

async function createVenv(root, opts, onLog) {
  const exe = runtimeExe(root, 'python', 'Python');
  const dir = opts && opts.dir;
  if (!dir) throw new Error('Choose the project folder for the virtual environment.');
  const venv = path.join(dir, '.venv');
  if (fs.existsSync(venv)) throw new Error(`${venv} already exists.`);
  onLog(`> python -m venv ${venv}`);
  await runStream(exe, ['-m', 'venv', venv], { cwd: dir }, onLog);
  onLog(`Done. Activate it with "${path.join('.venv', 'Scripts', 'activate')}".`);
  return { path: venv };
}

async function createDjango(root, opts, onLog) {
  const exe = runtimeExe(root, 'python', 'Python');
  const name = checkName(opts.name);
  if (!/^[A-Za-z_]\w*$/.test(name)) {
    throw new Error('Django project names must be valid Python identifiers (letters, digits, underscores).');
  }
  const { target } = targetDir(root, opts, name);
  fs.mkdirSync(target, { recursive: true });
  const venv = path.join(target, '.venv');
  onLog(`> python -m venv ${venv}`);
  await runStream(exe, ['-m', 'venv', venv], { cwd: target }, onLog);
  const venvPy = path.join(venv, 'Scripts', 'python.exe');
  onLog('> pip install django');
  await runStream(venvPy, ['-m', 'pip', 'install', 'django'], { cwd: target }, onLog);
  onLog(`> django-admin startproject ${name}`);
  await runStream(venvPy, ['-m', 'django', 'startproject', name, target], { cwd: target }, onLog);
  onLog('Done. Run ".venv\\Scripts\\python manage.py runserver" inside the project.');
  return { path: target };
}

/* ---------------- java: spring boot ---------------- */

// No local toolchain needed: start.spring.io generates the project (with the
// Maven wrapper inside), so it builds later with the active JDK.
async function createSpringBoot(root, opts, onLog) {
  const name = checkName(opts.name).toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('Spring project names must start with a letter and use only letters, digits and dashes.');
  }
  const { parent, target } = targetDir(root, opts, name);
  const params = new URLSearchParams({
    type: 'maven-project',
    language: 'java',
    groupId: 'com.example',
    artifactId: name,
    name,
    baseDir: name,
    dependencies: 'web,devtools',
  });
  const tmp = path.join(os.tmpdir(), `pamp-spring-${Date.now()}.zip`);
  onLog('Downloading starter from start.spring.io ...');
  await download(`https://start.spring.io/starter.zip?${params}`, tmp);
  onLog('Extracting ...');
  await extractZip(tmp, parent);
  try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  onLog('Done. Run "mvnw spring-boot:run" inside the project (uses the active JDK).');
  return { path: target };
}

/* ---------------- dotnet ---------------- */

async function createDotnet(root, opts, onLog) {
  const exe = runtimeExe(root, 'dotnet', '.NET SDK');
  const name = checkName(opts.name);
  const template = DOTNET_TEMPLATES.has(opts.template) ? opts.template : 'console';
  const { parent, target } = targetDir(root, opts, name);
  onLog(`> dotnet new ${template} -n ${name}`);
  await runStream(exe, ['new', template, '-n', name, '-o', target],
    { cwd: parent, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } }, onLog);
  onLog('Done. Run "dotnet run" inside the project.');
  return { path: target };
}

/* ---------------- public API ---------------- */

const ACTIONS = {
  vite: createVite,
  venv: createVenv,
  django: createDjango,
  spring: createSpringBoot,
  dotnet: createDotnet,
};

function create(root, action, opts, onLog) {
  const fn = ACTIONS[action];
  if (!fn) throw new Error(`Unknown scaffold: ${action}`);
  return fn(root, opts || {}, onLog);
}

module.exports = { create };
