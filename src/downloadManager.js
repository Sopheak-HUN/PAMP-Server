'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFile } = require('child_process');
const versions = require('./versionManager');

const UA = 'PAMP/0.1 (Windows)';
const LIST_TTL = 10 * 60 * 1000;

// toolId -> { ts, items } so install() can resolve a version back to its URL
const listCache = new Map();
// toolIds with an install in flight
const installing = new Set();

/* ---------------- http helpers ---------------- */

function request(url, { headers = {}, redirects = 8 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': UA, ...headers } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        resolve(request(next, { headers, redirects: redirects - 1 }));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error(`Timeout fetching ${url}`)));
  });
}

async function fetchText(url, headers) {
  const res = await request(url, { headers });
  return new Promise((resolve, reject) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve(data));
    res.on('error', reject);
  });
}

async function fetchJson(url, headers) {
  return JSON.parse(await fetchText(url, headers));
}

function downloadToFile(url, file, onProgress) {
  return request(url).then((res) => new Promise((resolve, reject) => {
    const total = Number(res.headers['content-length']) || 0;
    let received = 0;
    const out = fs.createWriteStream(file);
    res.on('data', (chunk) => {
      received += chunk.length;
      if (onProgress) onProgress(received, total);
    });
    res.pipe(out);
    res.on('error', (err) => { out.destroy(); reject(err); });
    out.on('error', reject);
    out.on('finish', () => resolve(received));
  }));
}

function extractZip(zipFile, destDir) {
  return new Promise((resolve, reject) => {
    const q = (s) => `'${s.replace(/'/g, "''")}'`;
    const script = `Expand-Archive -LiteralPath ${q(zipFile)} -DestinationPath ${q(destDir)} -Force`;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 600000, maxBuffer: 10 * 1024 * 1024 },
      (err, _stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve()));
  });
}

/* ---------------- version sources (all official) ---------------- */

const semverDesc = (a, b) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0); }
  return 0;
};

async function listPhp() {
  const byVersion = new Map(); // version -> { item, nts }

  // Currently-supported branches, straight from releases.json.
  const rel = await fetchJson('https://windows.php.net/downloads/releases/releases.json');
  for (const branch of Object.keys(rel)) {
    const b = rel[branch];
    if (!b || !b.version) continue;
    const key = Object.keys(b).find((k) => /^nts-vs\d+-x64$/i.test(k)) ||
                Object.keys(b).find((k) => /^ts-vs\d+-x64$/i.test(k));
    if (!key || !b[key].zip) continue;
    byVersion.set(b.version, {
      nts: key.startsWith('nts'),
      item: {
        version: b.version,
        label: `PHP ${b.version} (${key.startsWith('nts') ? 'NTS' : 'TS'} x64)`,
        url: `https://windows.php.net/downloads/releases/${b[key].zip.path}`,
        size: Number(b[key].zip.size) || 0,
      },
    });
  }

  // Everything older (7.4+) comes from the archives directory listing.
  const html = await fetchText('https://windows.php.net/downloads/releases/archives/');
  for (const m of html.matchAll(/php-(\d+\.\d+\.\d+)(-nts)?-Win32-(?:vc|vs)\d+-x64\.zip/gi)) {
    const [file, ver, nts] = m;
    const [maj, min] = ver.split('.').map(Number);
    if (maj < 7 || (maj === 7 && min < 4)) continue;
    const existing = byVersion.get(ver);
    if (existing && (existing.nts || !nts)) continue; // keep releases.json / NTS builds
    byVersion.set(ver, {
      nts: !!nts,
      item: {
        version: ver,
        label: `PHP ${ver} (${nts ? 'NTS' : 'TS'} x64, archived)`,
        url: `https://windows.php.net/downloads/releases/archives/${file}`,
      },
    });
  }

  return [...byVersion.values()].map((v) => v.item)
    .sort((a, b2) => semverDesc(a.version, b2.version));
}

async function listNode() {
  const idx = await fetchJson('https://nodejs.org/dist/index.json');
  return idx
    .filter((e) => Array.isArray(e.files) && e.files.includes('win-x64-zip'))
    .slice(0, 40)
    .map((e) => ({
      version: e.version.replace(/^v/, ''),
      label: `Node.js ${e.version}${e.lts ? ` LTS "${e.lts}"` : ''}`,
      url: `https://nodejs.org/dist/${e.version}/node-${e.version}-win-x64.zip`,
    }));
}

// python.org publishes full portable builds as NuGet packages (a .nupkg is a zip
// with tools/python.exe inside); nuget.org has a clean JSON version index.
async function listPython() {
  const idx = await fetchJson('https://api.nuget.org/v3-flatcontainer/python/index.json');
  return idx.versions
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .filter((v) => { const [maj, min] = v.split('.').map(Number); return maj > 3 || (maj === 3 && min >= 9); })
    .sort(semverDesc)
    .slice(0, 40)
    .map((v) => ({
      version: v,
      label: `Python ${v} (x64)`,
      url: `https://api.nuget.org/v3-flatcontainer/python/${v}/python.${v}.nupkg`,
    }));
}

// MySQL has no public version-index API; known winx64 zip versions, newest
// first. cdn.mysql.com hosts current releases, the archives endpoint the rest.
const MYSQL_VERSIONS = ['9.3.0', '9.2.0', '9.1.0', '9.0.1', '8.4.6', '8.4.5', '8.4.4', '8.4.3',
  '8.0.43', '8.0.42', '8.0.41', '8.0.40', '8.0.39', '8.0.37'];

function listMysql() {
  return MYSQL_VERSIONS.map((v) => {
    const branch = v.split('.').slice(0, 2).join('.');
    return {
      version: v,
      label: `MySQL ${v} (winx64, ~250 MB)`,
      url: `https://cdn.mysql.com/Downloads/MySQL-${branch}/mysql-${v}-winx64.zip`,
      fallbackUrl: `https://downloads.mysql.com/archives/get/p/23/file/mysql-${v}-winx64.zip`,
    };
  });
}

// PostgreSQL has no clean version-index API for the portable zip; EnterpriseDB
// hosts them at a predictable URL. "<version>-<build>" winx64 builds, newest
// first (the zip extracts to a nested pgsql\ folder — findExe handles that).
const POSTGRES_VERSIONS = ['17.5-1', '17.4-1', '17.2-1', '16.9-1', '16.8-1', '16.4-1',
  '15.13-1', '15.12-1', '15.8-1', '14.18-1', '14.17-1', '13.21-1'];

function listPostgres() {
  return POSTGRES_VERSIONS.map((vb) => {
    const version = vb.split('-')[0];
    return {
      version,
      label: `PostgreSQL ${version} (winx64, ~300 MB)`,
      url: `https://get.enterprisedb.com/postgresql/postgresql-${vb}-windows-x64-binaries.zip`,
    };
  });
}

async function listNginx() {
  const html = await fetchText('https://nginx.org/download/');
  const seen = new Set();
  for (const m of html.matchAll(/nginx-(\d+\.\d+\.\d+)\.zip/g)) seen.add(m[1]);
  return [...seen]
    .filter((v) => { const [maj, min] = v.split('.').map(Number); return maj > 1 || min >= 18; })
    .sort(semverDesc)
    .slice(0, 25)
    .map((v) => ({ version: v, label: `nginx ${v}`, url: `https://nginx.org/download/nginx-${v}.zip` }));
}

async function listDotnet() {
  const idx = await fetchJson('https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json');
  return (idx['releases-index'] || [])
    .filter((ch) => ch['latest-sdk'] && ch['support-phase'] !== 'eol')
    .map((ch) => ({
      version: ch['latest-sdk'],
      label: `.NET SDK ${ch['latest-sdk']} (${ch['support-phase']}, ~230 MB)`,
      url: `https://builds.dotnet.microsoft.com/dotnet/Sdk/${ch['latest-sdk']}/dotnet-sdk-${ch['latest-sdk']}-win-x64.zip`,
    }));
}

async function listJava() {
  const info = await fetchJson('https://api.adoptium.net/v3/info/available_releases');
  const lts = new Set(info.available_lts_releases || []);
  return (info.available_releases || [])
    .slice()
    .sort((a, b) => b - a)
    .map((n) => ({
      version: `jdk-${n}`,
      label: `Temurin JDK ${n}${lts.has(n) ? ' (LTS)' : ''} — latest build (~190 MB)`,
      url: `https://api.adoptium.net/v3/binary/latest/${n}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk`,
    }));
}

async function listRedis() {
  const gh = { accept: 'application/vnd.github+json' };
  const repos = [
    { repo: 'tporadowski/redis', pick: (a) => /x64.*\.zip$/i.test(a.name) },
    { repo: 'redis-windows/redis-windows', pick: (a) => /Windows-x64.*\.zip$/i.test(a.name) && !/service/i.test(a.name) },
  ];
  const out = [];
  for (const { repo, pick } of repos) {
    try {
      const rels = await fetchJson(`https://api.github.com/repos/${repo}/releases?per_page=10`, gh);
      for (const r of rels) {
        const asset = (r.assets || []).find(pick);
        if (!asset) continue;
        out.push({
          version: r.tag_name.replace(/^v/, ''),
          label: `Redis ${r.tag_name} (${repo.split('/')[0]})`,
          url: asset.browser_download_url,
          size: asset.size,
        });
      }
    } catch { /* one source down (e.g. rate limit) shouldn't kill the list */ }
  }
  return out.sort((a, b) => semverDesc(a.version, b.version));
}

const SOURCES = {
  php: listPhp, node: listNode, python: listPython, mysql: listMysql,
  postgres: listPostgres, nginx: listNginx, dotnet: listDotnet, java: listJava, redis: listRedis,
};

/* ---------------- public API ---------------- */

async function listAvailable(tool) {
  const cached = listCache.get(tool.id);
  if (cached && Date.now() - cached.ts < LIST_TTL) return cached.items;
  const items = await SOURCES[tool.id]();
  listCache.set(tool.id, { ts: Date.now(), items });
  return items;
}

function safeFolderName(v) {
  return v.replace(/[^\w.+-]/g, '-');
}

async function install(root, tool, version, onProgress) {
  if (installing.has(tool.id)) throw new Error(`An install for ${tool.name} is already running.`);
  const items = await listAvailable(tool);
  const item = items.find((i) => i.version === version);
  if (!item) throw new Error(`Unknown ${tool.name} version: ${version}`);

  const folder = safeFolderName(item.version);
  const dest = path.join(versions.toolRoot(root, tool.id), folder);
  if (fs.existsSync(dest) && fs.readdirSync(dest).length > 0) {
    throw new Error(`${dest} already exists.`);
  }

  installing.add(tool.id);
  // Expand-Archive requires a .zip extension (a .nupkg is a zip anyway).
  const tmp = path.join(os.tmpdir(), `pamp-${tool.id}-${folder}-${Date.now()}.zip`);
  try {
    try {
      await downloadToFile(item.url, tmp, (received, total) =>
        onProgress({ phase: 'download', received, total: total || item.size || 0 }));
    } catch (err) {
      if (!item.fallbackUrl) throw err;
      await downloadToFile(item.fallbackUrl, tmp, (received, total) =>
        onProgress({ phase: 'download', received, total: total || item.size || 0 }));
    }
    onProgress({ phase: 'extract' });
    fs.mkdirSync(dest, { recursive: true });
    await extractZip(tmp, dest);

    // Activate automatically when the tool has no active version yet.
    let activated = false;
    if (!versions.getActiveTarget(root, tool.id)) {
      try { versions.setActive(root, tool, folder); activated = true; } catch { /* leave manual */ }
    }
    return { folder, activated };
  } finally {
    installing.delete(tool.id);
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

module.exports = { listAvailable, install };
