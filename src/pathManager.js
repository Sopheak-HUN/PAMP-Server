'use strict';

const path = require('path');
const { execFile } = require('child_process');

// The PATH entries PAMP wants: bin/<tool>/current[/subdir] for every tool.
// Because "current" is a junction, switching versions never touches PATH again.
function desiredDirs(root, tools) {
  const dirs = [];
  for (const t of tools) {
    for (const sub of t.pathDirs) {
      dirs.push(path.join(root, 'bin', t.id, 'current', sub).replace(/[\\/]+$/, ''));
    }
  }
  return dirs;
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout);
      });
  });
}

async function getUserPath() {
  const out = await runPowerShell("[Environment]::GetEnvironmentVariable('Path','User')");
  return out.trim();
}

async function getStatus(root, tools) {
  const current = (await getUserPath()).split(';').map((p) => p.trim().toLowerCase().replace(/[\\/]+$/, ''));
  return desiredDirs(root, tools).map((dir) => ({
    dir,
    present: current.includes(dir.toLowerCase()),
  }));
}

// Put PAMP's entries at the *front* of the user PATH (no admin needed), so
// they win over other user-level tool installs (Laragon, XAMPP, ...) that
// ship their own php/node/mysql. Existing non-PAMP entries keep their order.
// SetEnvironmentVariable broadcasts WM_SETTINGCHANGE, so newly opened
// terminals pick the change up without a reboot.
async function setup(root, tools) {
  const dirs = desiredDirs(root, tools);
  const psList = dirs.map((d) => `'${d.replace(/'/g, "''")}'`).join(',');
  const script = `
$desired = @(${psList})
$desiredNorm = $desired | ForEach-Object { $_.TrimEnd('\\').ToLower() }
$cur = [Environment]::GetEnvironmentVariable('Path','User')
$keep = @($cur -split ';' | Where-Object { $_ -ne '' } |
  Where-Object { $desiredNorm -notcontains $_.TrimEnd('\\').ToLower() })
[Environment]::SetEnvironmentVariable('Path', (($desired + $keep) -join ';'), 'User')
`;
  await runPowerShell(script);
  return getStatus(root, tools);
}

module.exports = { desiredDirs, getStatus, setup };
