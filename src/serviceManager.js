'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execFile } = require('child_process');
const versions = require('./versionManager');

const LOG_CAP = 500;

// toolId -> { proc, startedAt }
const running = new Map();
// toolId -> [{ ts, line }]
const logBuffers = new Map();

let logListener = null;
function onLog(fn) { logListener = fn; }

function log(toolId, line) {
  const entry = { ts: Date.now(), line: String(line).replace(/\r?\n$/, '') };
  if (!entry.line) return;
  const buf = logBuffers.get(toolId) || [];
  buf.push(entry);
  if (buf.length > LOG_CAP) buf.splice(0, buf.length - LOG_CAP);
  logBuffers.set(toolId, buf);
  if (logListener) logListener(toolId, entry);
}

function getLogs(toolId) {
  return logBuffers.get(toolId) || [];
}

function checkPort(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port, timeout: 800 });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
  });
}

// Find the PID listening on a port, so we can control services that were
// started outside this app (or survived a previous app session).
function findPidByPort(port) {
  return new Promise((resolve) => {
    execFile('netstat', ['-ano', '-p', 'TCP'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i);
        if (m && Number(m[2]) === port) return resolve(Number(m[3]));
      }
      resolve(null);
    });
  });
}

async function getStatus(tool) {
  const rec = running.get(tool.id);
  if (rec && rec.proc.exitCode === null) {
    return { state: 'running', managed: true, pid: rec.proc.pid, port: rec.port || tool.port };
  }
  const open = await checkPort(tool.port);
  if (open) {
    const pid = await findPidByPort(tool.port);
    return { state: 'running', managed: false, pid, port: tool.port };
  }
  return { state: 'stopped', managed: false, pid: null, port: tool.port };
}

function execFileP(exe, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { windowsHide: true, timeout: 120000, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || stdout || err.message));
      resolve(`${stdout || ''}${stderr || ''}`);
    });
  });
}

// nginx has no CLI flags for these — they live in conf/nginx.conf. Keep the
// first listen and root directives (the default server) in sync with the
// configured port and Document Root before each start.
function ensureNginxConf(prefix, port, docRoot) {
  const conf = path.join(prefix, 'conf', 'nginx.conf');
  try {
    const src = fs.readFileSync(conf, 'utf8');
    const changed = [];
    let next = src.replace(/(^[ \t]*listen[ \t]+)(\d+)([ \t]*;)/m, (m, pre, cur, post) => {
      if (Number(cur) === port) return m;
      changed.push(`listen ${port}`);
      return `${pre}${port}${post}`;
    });
    if (docRoot) {
      const rootVal = docRoot.replace(/\\/g, '/');
      next = next.replace(/(^[ \t]*root[ \t]+)([^;]+)(;)/m, (m, pre, cur, post) => {
        if (cur.trim().replace(/^"|"$/g, '') === rootVal) return m;
        changed.push(`root ${rootVal}`);
        return `${pre}"${rootVal}"${post}`;
      });
    }
    if (changed.length) {
      fs.writeFileSync(conf, next);
      log('nginx', `Updated conf\\nginx.conf: ${changed.join(', ')}.`);
    }
  } catch (err) {
    log('nginx', `Could not sync nginx.conf: ${err.message}`);
  }
}

// MySQL refuses to start on an uninitialized data directory; create one on
// first run (insecure = root with empty password, standard for local dev).
async function ensureMysqlData(dataRoot, exe) {
  const dataDir = path.join(dataRoot, 'mysql');
  if (fs.existsSync(path.join(dataDir, 'mysql'))) return dataDir;
  fs.mkdirSync(dataRoot, { recursive: true });
  log('mysql', `Initializing data directory at ${dataDir} (first run, may take a minute)...`);
  await execFileP(exe, ['--initialize-insecure', `--datadir=${dataDir}`], { timeout: 300000 });
  log('mysql', 'Data directory initialized. Root password is empty.');
  return dataDir;
}

async function start(root, tool, opts = {}) {
  const status = await getStatus(tool);
  if (status.state === 'running') {
    throw new Error(`${tool.name} is already running on port ${tool.port} (pid ${status.pid ?? '?'}).`);
  }
  const exe = versions.currentExe(root, tool);
  const base = versions.currentDir(root, tool);
  if (!exe || !base) {
    throw new Error(`No active ${tool.name} version. Add one under bin\\${tool.id}\\ and click "Use".`);
  }

  let args = [];
  const cwd = fs.realpathSync(base);
  const dataRoot = opts.dataRoot || path.join(root, 'data');
  if (tool.id === 'mysql') {
    const dataDir = await ensureMysqlData(dataRoot, exe);
    args = ['--console', `--datadir=${dataDir}`, `--port=${tool.port}`];
  } else if (tool.id === 'nginx') {
    ensureNginxConf(cwd, tool.port, opts.docRoot);
    args = ['-p', cwd];
  } else if (tool.id === 'redis') {
    const conf = path.join(cwd, 'redis.windows.conf');
    // Keep dumps in the shared data dir so they survive version switches.
    const redisDir = path.join(dataRoot, 'redis');
    fs.mkdirSync(redisDir, { recursive: true });
    // CLI options after the conf file override its values.
    args = [...(fs.existsSync(conf) ? [conf] : []), '--port', String(tool.port), '--dir', redisDir];
  }

  log(tool.id, `Starting: ${exe} ${args.join(' ')}`);
  const proc = spawn(exe, args, { cwd, windowsHide: true });
  proc.stdout.on('data', (d) => d.toString().split(/\r?\n/).forEach((l) => log(tool.id, l)));
  proc.stderr.on('data', (d) => d.toString().split(/\r?\n/).forEach((l) => log(tool.id, l)));
  proc.on('error', (err) => log(tool.id, `Process error: ${err.message}`));
  proc.on('exit', (code) => {
    log(tool.id, `Process exited with code ${code}.`);
    running.delete(tool.id);
  });
  // exe/cwd/port are remembered so stop and status target the instance that
  // was actually started, even if the user switches the active version or
  // changes the port setting while it runs.
  running.set(tool.id, { proc, startedAt: Date.now(), exe, cwd, port: tool.port });

  // nginx.exe forks a master+workers and the launcher process may exit
  // immediately; the port check in getStatus covers the real state.
  return getStatus(tool);
}

async function gracefulStop(root, tool, port) {
  const rec = running.get(tool.id);
  const exe = (rec && rec.exe) || versions.currentExe(root, tool);
  const base = (rec && rec.cwd) || versions.currentDir(root, tool);
  if (!exe || !base) return false;
  const cwd = fs.realpathSync(base);
  try {
    if (tool.id === 'nginx') {
      // "-s quit" is delivered via the pid file the running master wrote; if
      // it isn't in this prefix (version switched mid-run, external start
      // from another folder), skip straight to the force-kill fallback.
      if (!fs.existsSync(path.join(cwd, 'logs', 'nginx.pid'))) return false;
      await execFileP(exe, ['-p', cwd, '-s', 'quit'], { cwd, timeout: 10000 });
    } else if (tool.id === 'mysql') {
      const admin = path.join(cwd, 'bin', 'mysqladmin.exe');
      if (!fs.existsSync(admin)) return false;
      await execFileP(admin, ['-u', 'root', `--port=${port}`, 'shutdown'], { timeout: 30000 });
    } else if (tool.id === 'redis') {
      const cli = path.join(cwd, 'redis-cli.exe');
      if (!fs.existsSync(cli)) return false;
      await execFileP(cli, ['-p', String(port), 'shutdown'], { timeout: 10000 });
    } else {
      return false;
    }
    return true;
  } catch (err) {
    log(tool.id, `Graceful stop failed: ${err.message}`);
    return false;
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitUntilStopped(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await checkPort(port))) return true;
    await sleep(400);
  }
  return false;
}

async function stop(root, tool) {
  const status = await getStatus(tool);
  if (status.state !== 'running') return status;
  // Target the port the instance actually listens on (status.port carries the
  // start-time port for managed processes), not the current setting.
  const port = status.port || tool.port;

  log(tool.id, 'Stopping...');
  const graceful = await gracefulStop(root, tool, port);
  // Only wait for a graceful exit if the signal was actually delivered;
  // otherwise go straight to the force kill instead of idling 8 seconds.
  const stopped = graceful && (await waitUntilStopped(port, 8000));

  if (!stopped) {
    const pid = status.pid || (await findPidByPort(port));
    if (pid) {
      log(tool.id, `Force killing pid ${pid}...`);
      try { await execFileP('taskkill', ['/PID', String(pid), '/T', '/F']); } catch (err) {
        log(tool.id, `taskkill failed: ${err.message}`);
      }
      await waitUntilStopped(port, 4000);
    }
  }
  running.delete(tool.id);
  log(tool.id, 'Stopped.');
  return getStatus(tool);
}

module.exports = { start, stop, getStatus, getLogs, onLog };
