'use strict';

const fs = require('fs');
const path = require('path');
const { TOOLS } = require('./toolsConfig');

// Default ports come straight from the tool definitions so they never drift.
const DEFAULT_PORTS = Object.fromEntries(
  TOOLS.filter((t) => t.kind === 'service' && t.port).map((t) => [t.id, t.port])
);

// Persisted next to the app so the whole stack stays portable.
const DEFAULTS = {
  theme: 'dark',
  lang: 'en',
  ports: DEFAULT_PORTS,
  runAtStartup: false,      // launch PAMP at Windows login
  runMinimized: false,      // start the window minimized
  autoStartServices: false, // start every service with an active version on launch
  closeToTray: true,        // closing the window hides to the tray instead of quitting
  documentRoot: '',         // nginx web root ('' = the build's default html folder)
  dataDir: '',              // MySQL/Redis data location ('' = <stack root>\data)
};

function file(root) {
  return path.join(root, 'settings.json');
}

function get(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file(root), 'utf8'));
    return { ...DEFAULTS, ...parsed, ports: { ...DEFAULT_PORTS, ...(parsed.ports || {}) } };
  } catch {
    return { ...DEFAULTS, ports: { ...DEFAULT_PORTS } };
  }
}

function set(root, patch) {
  const cur = get(root);
  const next = { ...cur, ...patch };
  if (patch.ports) {
    next.ports = { ...cur.ports };
    for (const [id, v] of Object.entries(patch.ports)) {
      const n = Math.trunc(Number(v));
      if (id in DEFAULT_PORTS && n >= 1 && n <= 65535) next.ports[id] = n;
    }
  }
  fs.writeFileSync(file(root), JSON.stringify(next, null, 2));
  return next;
}

module.exports = { get, set, DEFAULTS };
