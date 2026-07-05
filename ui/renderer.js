'use strict';

/* global window, document */

const SETTINGS_VIEW = '__settings__';

const state = {
  tools: [],            // from pamp.listTools()
  status: {},           // toolId -> { state, managed, pid, port } (services only)
  selected: null,       // toolId shown in the detail pane, or SETTINGS_VIEW
  logsFollow: true,
  settings: { theme: 'dark', lang: 'en' },
  settingsTab: 'general', // active tab on the settings page
  dlLists: {},          // toolId -> 'loading' | Error | [{version,label,...}]
  dlActive: {},         // toolId -> { version, phase, pct, received, total }
  phpInfo: undefined,   // undefined = loading, { available, ... } once fetched
  phpExpanded: false,   // "+N more" expanded state on the extensions card
  phpManage: false,     // extensions card is in enable/disable mode
  composer: null,       // { installed, version } from composerStatus()
  quickBusy: {},        // quick-tool task -> progress label while running
  quickLog: [],         // streamed lines from the Laravel scaffold
  laravelForm: false,   // inline "create project" form is open
  laravelName: '',
  laravelDir: '',       // chosen parent folder ('' = <stack>\www)
  nodeInfo: undefined,  // undefined = loading, { available, packages } once fetched
  nodeBusy: {},         // package name -> true while npm install/uninstall runs
  nodeLog: [],          // streamed npm output lines
};

// How many extension chips to show before collapsing behind "+N more".
const PHP_CHIP_LIMIT = 16;

/* ---------------- i18n ---------------- */

const I18N = {
  en: {
    brandSub: 'Dev Stack Control',
    addToPath: 'Add to PATH',
    addToPathTitle: 'Add all current-version folders to your user PATH',
    refresh: 'Refresh',
    settingsTitle: 'Settings',
    settingsSub: 'Saved to settings.json',
    appearance: 'Appearance',
    theme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    language: 'Language',
    loading: 'Loading…',
    selectTool: 'Select a tool from the left to manage its versions.',
    noVersion: 'no version',
    runtime: 'Runtime',
    servicePort: 'Service · port {port}',
    activeV: 'active: v{v}',
    noActiveVersion: 'no active version',
    running: 'Running',
    stopped: 'Stopped',
    startingState: 'Starting...',
    errorState: 'Error',
    external: 'external',
    start: 'Start',
    stop: 'Stop',
    openFolder: 'Open folder',
    versions: 'Versions',
    thFolder: 'Folder',
    thDetected: 'Detected version',
    detected: 'detected',
    noExe: 'no executable found',
    use: 'Use',
    inUse: 'in use',
    noVersionsYet: 'No versions installed yet.',
    installHint: 'Download a Windows build of {name}, extract it into a subfolder of the directory above (e.g. {dir}\\8.3.1\\), then click Refresh and press "Use".',
    logs: 'Logs',
    follow: 'Follow',
    clearLogs: 'Clear',
    logsCleared: '{name} logs cleared.',
    nowUsing: '{name}: now using {v}',
    starting: 'Starting {name}…',
    stopping: 'Stopping {name}…',
    restart: 'Restart',
    restarting: 'Restarting {name}…',
    pathOk: 'All tool folders are on your user PATH. Open a new terminal to use them.',
    pathPartial: 'PATH updated, but {n} entries could not be verified.',
    pathFailed: 'PATH setup failed: {msg}',
    download: 'Download',
    dlLoad: 'Show available versions',
    dlLoading: 'Loading version list…',
    dlListFailed: 'Could not load the version list: {msg}',
    dlEmpty: 'No downloadable versions found.',
    dlInstall: 'Install',
    dlDownloading: 'Downloading… {pct}%',
    dlExtracting: 'Extracting…',
    dlDone: '{name} {v} installed.',
    dlDoneActive: '{name} {v} installed and set active.',
    dlFailed: 'Install failed: {msg}',
    dlSource: 'from the official source',
    ports: 'Service ports',
    portHint: 'Applied the next time the service starts',
    portSaved: '{name}: port set to {port}',
    portInvalid: 'Invalid port — use a number from 1 to 65535.',
    tabGeneral: 'General',
    tabPorts: 'Services & Ports',
    behavior: 'Startup',
    runAtStartup: 'Run PAMP when Windows starts',
    runMinimized: 'Run minimized',
    autoStart: 'Start all services automatically',
    folders: 'Folders',
    docRoot: 'Document Root',
    docRootHint: 'nginx web root — applied on next start',
    dataDir: 'Data Directory',
    dataDirHint: 'MySQL / Redis data — applied on next start',
    browse: 'Browse…',
    reset: 'Reset',
    defaultVal: '(default)',
    phpExtensions: 'PHP Extensions',
    manageExt: 'Manage Extensions',
    manageDone: 'Done',
    extMore: '+ {n} more',
    extLess: 'Show less',
    extRestartHint: 'Restart PHP / your web server to apply changes.',
    extNone: 'No extensions found in the ext folder.',
    extEnabled: '{name} enabled',
    extDisabled: '{name} disabled',
    extFailed: 'Could not update {name}: {msg}',
    phpConfig: 'Configuration',
    phpIni: 'php.ini',
    phpExtDir: 'Extensions Dir',
    phpErrorLog: 'Error Log',
    view: 'View',
    editTitle: 'Edit',
    openFolderTitle: 'Open folder',
    phpNoActive: 'Activate a PHP version to manage its extensions and configuration.',
    quickTools: 'Quick Tools',
    qtPhpinfo: 'phpinfo();',
    qtPhpinfoSub: 'Open the PHP info page',
    qtComposer: 'Install Composer',
    qtComposerInstalled: 'Composer {v}',
    qtComposerSub: 'PHP dependency manager',
    qtLaravel: 'Create Laravel project',
    qtLaravelSub: 'composer create-project',
    qtPma: 'phpMyAdmin',
    qtPmaSub: 'Database web UI',
    qtWorking: 'Working…',
    qtOpening: 'Opening…',
    qtComposerDone: 'Composer {v} installed.',
    qtPmaOpening: 'Starting phpMyAdmin…',
    qtProjectName: 'Project name',
    qtChooseFolder: 'Choose folder…',
    qtCreate: 'Create',
    qtNeedName: 'Enter a project name.',
    qtLaravelDone: 'Laravel project created at {path}',
    qtNeedMysql: 'phpMyAdmin needs MySQL running — start it from the MySQL tab to log in.',
    nodePackages: 'Global Packages',
    nodePackagesSub: 'npm install -g',
    nodeNoActive: 'Activate a Node.js version to manage global packages.',
    pkgInstall: 'Install',
    pkgRemove: 'Remove',
    pkgInstallDone: '{name} installed.',
    pkgRemoveDone: '{name} removed.',
    pkgFailed: 'Could not update {name}: {msg}',
  },
  km: {
    brandSub: 'ផ្ទាំងគ្រប់គ្រង Dev Stack',
    addToPath: 'បន្ថែមទៅ PATH',
    addToPathTitle: 'បន្ថែមថតកំណែសកម្មទាំងអស់ទៅ PATH របស់អ្នក',
    refresh: 'ផ្ទុកឡើងវិញ',
    settingsTitle: 'ការកំណត់',
    settingsSub: 'រក្សាទុកក្នុង settings.json',
    appearance: 'រូបរាង',
    theme: 'ធីម',
    themeDark: 'ងងឹត',
    themeLight: 'ភ្លឺ',
    language: 'ភាសា',
    loading: 'កំពុងផ្ទុក…',
    selectTool: 'ជ្រើសរើសឧបករណ៍នៅខាងឆ្វេង ដើម្បីគ្រប់គ្រងកំណែរបស់វា។',
    noVersion: 'គ្មានកំណែ',
    runtime: 'Runtime',
    servicePort: 'សេវាកម្ម · ច្រក {port}',
    activeV: 'សកម្ម៖ v{v}',
    noActiveVersion: 'គ្មានកំណែសកម្ម',
    running: 'កំពុងដំណើរការ',
    stopped: 'បានឈប់',
    startingState: 'កំពុងចាប់ផ្តើម...',
    errorState: 'កំហុស',
    external: 'ខាងក្រៅ',
    start: 'ចាប់ផ្តើម',
    stop: 'បញ្ឈប់',
    openFolder: 'បើកថត',
    versions: 'កំណែ',
    thFolder: 'ថត',
    thDetected: 'កំណែដែលរកឃើញ',
    detected: 'រកឃើញ',
    noExe: 'រកមិនឃើញឯកសារប្រតិបត្តិ',
    use: 'ប្រើ',
    inUse: 'កំពុងប្រើ',
    noVersionsYet: 'មិនទាន់មានកំណែដំឡើងនៅឡើយទេ។',
    installHint: 'ទាញយក {name} កំណែ Windows រួចពន្លាចូលក្នុងថតរងនៃថតខាងលើ (ឧ. {dir}\\8.3.1\\) បន្ទាប់មកចុច "ផ្ទុកឡើងវិញ" រួចចុច "ប្រើ"។',
    logs: 'កំណត់ហេតុ',
    follow: 'តាមដាន',
    clearLogs: 'សម្អាត',
    logsCleared: 'បានសម្អាតកំណត់ហេតុ {name}។',
    nowUsing: '{name}៖ ឥឡូវកំពុងប្រើ {v}',
    starting: 'កំពុងចាប់ផ្តើម {name}…',
    stopping: 'កំពុងបញ្ឈប់ {name}…',
    restart: 'ចាប់ផ្តើមឡើងវិញ',
    restarting: 'កំពុងចាប់ផ្តើម {name} ឡើងវិញ…',
    pathOk: 'ថតឧបករណ៍ទាំងអស់មាននៅក្នុង PATH របស់អ្នកហើយ។ បើក terminal ថ្មីដើម្បីប្រើ។',
    pathPartial: 'PATH បានធ្វើបច្ចុប្បន្នភាព ប៉ុន្តែ {n} ធាតុមិនអាចផ្ទៀងផ្ទាត់បានទេ។',
    pathFailed: 'ការកំណត់ PATH បរាជ័យ៖ {msg}',
    download: 'ទាញយក',
    dlLoad: 'បង្ហាញកំណែដែលអាចទាញយកបាន',
    dlLoading: 'កំពុងផ្ទុកបញ្ជីកំណែ…',
    dlListFailed: 'មិនអាចផ្ទុកបញ្ជីកំណែបានទេ៖ {msg}',
    dlEmpty: 'រកមិនឃើញកំណែដែលអាចទាញយកបានទេ។',
    dlInstall: 'ដំឡើង',
    dlDownloading: 'កំពុងទាញយក… {pct}%',
    dlExtracting: 'កំពុងពន្លា…',
    dlDone: '{name} {v} បានដំឡើងរួចរាល់។',
    dlDoneActive: '{name} {v} បានដំឡើង និងកំណត់ជាកំណែសកម្ម។',
    dlFailed: 'ការដំឡើងបរាជ័យ៖ {msg}',
    dlSource: 'ពីប្រភពផ្លូវការ',
    ports: 'ច្រកសេវាកម្ម',
    portHint: 'អនុវត្តនៅពេលចាប់ផ្តើមសេវាកម្មលើកក្រោយ',
    portSaved: '{name}៖ ច្រកបានកំណត់ទៅ {port}',
    portInvalid: 'ច្រកមិនត្រឹមត្រូវ — ប្រើលេខពី 1 ដល់ 65535។',
    tabGeneral: 'ទូទៅ',
    tabPorts: 'សេវាកម្ម និងច្រក',
    behavior: 'ការចាប់ផ្តើម',
    runAtStartup: 'ដំណើរការ PAMP នៅពេល Windows ចាប់ផ្តើម',
    runMinimized: 'ដំណើរការដោយបង្រួម',
    autoStart: 'ចាប់ផ្តើមសេវាកម្មទាំងអស់ដោយស្វ័យប្រវត្តិ',
    folders: 'ថត',
    docRoot: 'Document Root',
    docRootHint: 'ថត web root របស់ nginx — អនុវត្តនៅពេលចាប់ផ្តើមលើកក្រោយ',
    dataDir: 'ថតទិន្នន័យ',
    dataDirHint: 'ទិន្នន័យ MySQL / Redis — អនុវត្តនៅពេលចាប់ផ្តើមលើកក្រោយ',
    browse: 'រកមើល…',
    reset: 'កំណត់ឡើងវិញ',
    defaultVal: '(លំនាំដើម)',
    phpExtensions: 'ផ្នែកបន្ថែម PHP',
    manageExt: 'គ្រប់គ្រងផ្នែកបន្ថែម',
    manageDone: 'រួចរាល់',
    extMore: '+ {n} បន្ថែម',
    extLess: 'បង្ហាញតិច',
    extRestartHint: 'ចាប់ផ្តើម PHP / web server ឡើងវិញ ដើម្បីអនុវត្តការផ្លាស់ប្តូរ។',
    extNone: 'រកមិនឃើញផ្នែកបន្ថែមក្នុងថត ext ទេ។',
    extEnabled: 'បានបើក {name}',
    extDisabled: 'បានបិទ {name}',
    extFailed: 'មិនអាចធ្វើបច្ចុប្បន្នភាព {name}៖ {msg}',
    phpConfig: 'ការកំណត់រចនាសម្ព័ន្ធ',
    phpIni: 'php.ini',
    phpExtDir: 'ថតផ្នែកបន្ថែម',
    phpErrorLog: 'កំណត់ហេតុកំហុស',
    view: 'មើល',
    editTitle: 'កែសម្រួល',
    openFolderTitle: 'បើកថត',
    phpNoActive: 'ធ្វើឲ្យកំណែ PHP សកម្ម ដើម្បីគ្រប់គ្រងផ្នែកបន្ថែម និងការកំណត់រចនាសម្ព័ន្ធ។',
    quickTools: 'ឧបករណ៍រហ័ស',
    qtPhpinfo: 'phpinfo();',
    qtPhpinfoSub: 'បើកទំព័រព័ត៌មាន PHP',
    qtComposer: 'ដំឡើង Composer',
    qtComposerInstalled: 'Composer {v}',
    qtComposerSub: 'កម្មវិធីគ្រប់គ្រង dependency របស់ PHP',
    qtLaravel: 'បង្កើតគម្រោង Laravel',
    qtLaravelSub: 'composer create-project',
    qtPma: 'phpMyAdmin',
    qtPmaSub: 'UI គ្រប់គ្រងទិន្នន័យ',
    qtWorking: 'កំពុងដំណើរការ…',
    qtOpening: 'កំពុងបើក…',
    qtComposerDone: 'បានដំឡើង Composer {v}។',
    qtPmaOpening: 'កំពុងចាប់ផ្តើម phpMyAdmin…',
    qtProjectName: 'ឈ្មោះគម្រោង',
    qtChooseFolder: 'ជ្រើសរើសថត…',
    qtCreate: 'បង្កើត',
    qtNeedName: 'បញ្ចូលឈ្មោះគម្រោង។',
    qtLaravelDone: 'បានបង្កើតគម្រោង Laravel នៅ {path}',
    qtNeedMysql: 'phpMyAdmin ត្រូវការ MySQL ដំណើរការ — ចាប់ផ្តើមវានៅផ្ទាំង MySQL ដើម្បីចូល។',
    nodePackages: 'កញ្ចប់សកល',
    nodePackagesSub: 'npm install -g',
    nodeNoActive: 'ធ្វើឲ្យកំណែ Node.js សកម្ម ដើម្បីគ្រប់គ្រងកញ្ចប់សកល។',
    pkgInstall: 'ដំឡើង',
    pkgRemove: 'លុបចេញ',
    pkgInstallDone: 'បានដំឡើង {name}។',
    pkgRemoveDone: 'បានលុប {name}។',
    pkgFailed: 'មិនអាចធ្វើបច្ចុប្បន្នភាព {name}៖ {msg}',
  },
};

function t(key, vars) {
  const table = I18N[state.settings.lang] || I18N.en;
  let s = table[key] ?? I18N.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

function stateLabel(stateName) {
  if (stateName === 'running') return t('running');
  if (stateName === 'stopped') return t('stopped');
  if (stateName === 'starting') return t('startingState');
  if (stateName === 'error') return t('errorState');
  return stateName;
}

/* ---------------- helpers ---------------- */

const $ = (sel, el) => (el || document).querySelector(sel);

function toast(msg, kind) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show ${kind || ''}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = ''; }, 3500);
}

function h(tag, attrs, ...children) {
  const svgTags = ['svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'ellipse', 'g'];
  const el = svgTags.includes(tag)
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') {
      el.setAttribute('class', v);
    } else if (k === 'text') {
      el.textContent = v;
    } else if (k.startsWith('on')) {
      el.addEventListener(k.slice(2), v);
    } else if (v !== null && v !== undefined) {
      el.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function tool(id) {
  return state.tools.find((x) => x.id === id);
}

function statusOf(id) {
  return state.status[id] || null;
}

function renderToolBadge(tl, sizeClass = '') {
  const isLg = sizeClass.includes('lg');
  return h('span', { class: `tool-badge has-logo ${sizeClass}`.trim(), style: `--accent:${tl.accent}` },
    h('img', { src: `logos/${tl.id}.svg`, alt: tl.badge, class: `tool-logo-img ${isLg ? 'lg' : ''}`.trim() })
  );
}

function renderSettingsIcon(sizeClass = '') {
  const isLg = sizeClass.includes('lg');
  const size = isLg ? 20 : 13;
  return h('svg', {
    class: `icon-gear ${sizeClass}`.trim(),
    width: String(size),
    height: String(size),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    style: isLg ? '' : 'display: inline-block; vertical-align: -1px; margin-right: 6px;'
  },
    h('circle', { cx: '12', cy: '12', r: '3' }),
    h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' })
  );
}

function iconSvg(paths, size = 15) {
  return h('svg', {
    width: String(size), height: String(size), viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, ...paths.map((d) => h('path', { d })));
}

const ICON_PENCIL = ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z'];
const ICON_FOLDER = ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'];

function iconBtn(paths, title, onclick) {
  return h('button', { class: 'icon-btn', title, onclick }, iconSvg(paths));
}

// Compact play / restart / stop icon group for services. The play button is
// the blue primary action while the service is stopped; restart and stop only
// light up once it runs.
function svcControls(toolId, running) {
  const fillIcon = (...shapes) =>
    h('svg', { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'currentColor' }, ...shapes);
  const playIcon = fillIcon(h('path', { d: 'M7 4.5v15l13-7.5z' }));
  const stopIcon = fillIcon(h('rect', { x: '5.5', y: '5.5', width: '13', height: '13', rx: '2' }));
  const restartIcon = h('svg', {
    width: '13', height: '13', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, h('path', { d: 'M23 4v6h-6' }), h('path', { d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' }));

  const btn = (title, icon, enabled, primary, onclick) =>
    h('button', {
      class: `svc-btn ${primary ? 'primary' : ''}`,
      title,
      disabled: enabled ? null : 'disabled',
      onclick: (e) => { e.stopPropagation(); onclick(); },
    }, icon);

  return h('div', { class: 'svc-group' },
    btn(t('start'), playIcon, !running, !running, () => startService(toolId)),
    btn(t('restart'), restartIcon, running, false, () => restartService(toolId)),
    btn(t('stop'), stopIcon, running, false, () => stopService(toolId)));
}

/* ---------------- settings ---------------- */

function applyTheme() {
  document.body.classList.toggle('light', state.settings.theme === 'light');
  document.documentElement.lang = state.settings.lang;
}

// Static chrome (sidebar footer, brand) isn't re-created per render, so its
// labels are set explicitly whenever the language changes.
function renderStatic() {
  $('.brand-sub').textContent = t('brandSub');
  const pathBtn = $('#btn-path-setup');
  pathBtn.textContent = t('addToPath');
  pathBtn.title = t('addToPathTitle');
  $('#btn-refresh').textContent = t('refresh');
  const btn = $('#btn-settings');
  btn.replaceChildren(renderSettingsIcon(), document.createTextNode(t('settingsTitle')));
}

async function saveSettings(patch) {
  try {
    state.settings = await window.pamp.setSettings(patch);
  } catch (err) {
    toast(err.message, 'err');
    return;
  }
  applyTheme();
  renderStatic();
  renderSidebar();
  renderDetail();
}

function renderSettings(root) {
  const s = state.settings;
  const tab = state.settingsTab;
  const seg = (options, current, onpick) =>
    h('div', { class: 'seg' }, ...options.map((o) =>
      h('button', {
        class: `seg-btn ${current === o.value ? 'on' : ''}`,
        text: o.label,
        onclick: () => onpick(o.value),
      })));
  const checkRow = (key, label) =>
    h('label', { class: 'check-row' },
      h('input', {
        type: 'checkbox', checked: s[key] ? 'checked' : null,
        onchange: (e) => saveSettings({ [key]: e.target.checked }),
      }),
      label);
  const folderRow = (key, label, hint) =>
    h('div', { class: 'setting-row' },
      h('div', { class: 'folder-info' },
        h('div', { class: 'setting-label', text: label }),
        h('div', { class: 'muted', text: hint }),
        h('div', { class: 'path-val mono', text: s[key] || t('defaultVal') })),
      h('div', { class: 'dl-row' },
        h('button', {
          class: 'btn btn-small', text: t('browse'),
          onclick: async () => {
            const dir = await window.pamp.pickFolder();
            if (dir) saveSettings({ [key]: dir });
          },
        }),
        s[key] && h('button', {
          class: 'btn btn-small btn-ghost', text: t('reset'),
          onclick: () => saveSettings({ [key]: '' }),
        })));

  const generalTab = [
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: t('behavior') })),
      checkRow('runAtStartup', t('runAtStartup')),
      checkRow('runMinimized', t('runMinimized')),
      checkRow('autoStartServices', t('autoStart'))),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: t('appearance') })),
      h('div', { class: 'setting-row' },
        h('div', { class: 'setting-label', text: t('theme') }),
        seg([
          { value: 'dark', label: t('themeDark') },
          { value: 'light', label: t('themeLight') },
        ], s.theme, (v) => saveSettings({ theme: v }))),
      h('div', { class: 'setting-row' },
        h('div', { class: 'setting-label', text: t('language') }),
        seg([
          { value: 'en', label: 'English' },
          { value: 'km', label: 'ខ្មែរ' },
        ], s.lang, (v) => saveSettings({ lang: v })))),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { text: t('folders') })),
      folderRow('documentRoot', t('docRoot'), t('docRootHint')),
      folderRow('dataDir', t('dataDir'), t('dataDirHint'))),
  ];

  const portsTab = [
    h('section', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h2', { text: t('ports') }),
        h('span', { class: 'muted', text: t('portHint') })),
      ...state.tools.filter((x) => x.kind === 'service').map((svc) =>
        h('div', { class: 'setting-row' },
          h('div', { class: 'setting-label' },
            renderToolBadge(svc),
            svc.name),
          h('input', {
            type: 'text', class: 'port-input',
            inputmode: 'numeric', pattern: '[0-9]*',
            value: String((s.ports && s.ports[svc.id]) || svc.port),
            onchange: (e) => savePort(svc.id, e.target.value),
            oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, ''); },
            onfocus: (e) => {
              const input = e.target;
              setTimeout(() => {
                input.setSelectionRange(input.value.length, input.value.length);
              }, 0);
            },
          })))),
  ];

  const tabBtn = (id, label) =>
    h('button', {
      class: `tab ${tab === id ? 'on' : ''}`, text: label,
      onclick: () => { state.settingsTab = id; renderDetail(); },
    });

  root.replaceChildren(
    h('div', { class: 'detail-header' },
      h('div', { class: 'detail-title' },
        h('span', { class: 'tool-badge lg', style: '--accent:#8b93a7' }, renderSettingsIcon('lg')),
        h('div', {},
          h('h1', { text: t('settingsTitle') }),
          h('div', { class: 'detail-sub' }, h('span', { text: t('settingsSub') }))))),
    h('div', { class: 'tabs' }, tabBtn('general', t('tabGeneral')), tabBtn('ports', t('tabPorts'))),
    ...(tab === 'general' ? generalTab : portsTab)
  );
}

async function savePort(toolId, value) {
  const n = Math.trunc(Number(value));
  if (!(n >= 1 && n <= 65535)) {
    toast(t('portInvalid'), 'err');
    renderDetail();
    return;
  }
  await saveSettings({ ports: { ...(state.settings.ports || {}), [toolId]: n } });
  toast(t('portSaved', { name: tool(toolId).name, port: n }), 'ok');
  // Reload tools so the "Service · port N" headers reflect the change.
  await refresh();
}

/* ---------------- sidebar ---------------- */

function renderSidebar() {
  const nav = $('#tool-list');
  nav.replaceChildren();
  for (const tl of state.tools) {
    const st = statusOf(tl.id);
    const item = h('button',
      { class: `tool-item ${state.selected === tl.id ? 'active' : ''}`, onclick: () => select(tl.id), style: `--accent:${tl.accent}` },
      renderToolBadge(tl),
      h('span', { class: 'tool-item-body' },
        h('span', { class: 'tool-item-name', text: tl.name }),
        h('span', { class: 'tool-item-sub', text: tl.activeVersion ? `v${tl.activeVersion}` : t('noVersion') })),
      tl.kind === 'service'
        ? h('span', { class: `dot ${st ? st.state : 'stopped'}`,
            title: st ? stateLabel(st.state) : t('stopped') })
        : h('span', { class: 'dot none' })
    );
    nav.appendChild(item);
  }
  $('#btn-settings').classList.toggle('active', state.selected === SETTINGS_VIEW);
}

function renderDashboard(root) {
  root.className = 'dashboard-pane';
  
  // 1. Header
  const header = h('div', { class: 'dashboard-header' },
    h('img', { src: 'logo.png', class: 'dashboard-logo', alt: 'PAMP Logo' }),
    h('div', { class: 'dashboard-info' },
      h('h1', { text: 'PAMP Control Center' }),
      h('p', { class: 'muted', text: 'Portable Developer Stack & Version Manager' })
    )
  );

  // 2. Active Services
  const services = state.tools.filter(t => t.kind === 'service');
  const serviceCards = services.map(svc => {
    const st = statusOf(svc.id);
    const running = !!(st && st.state === 'running');
    
    return h('div', { class: 'card dashboard-card', style: `--accent:${svc.accent}` },
      h('div', { class: 'dashboard-card-top' },
        renderToolBadge(svc),
        h('div', { class: 'dashboard-card-title' },
          h('h3', { text: svc.name }),
          h('span', { class: 'muted', text: svc.activeVersion ? `v${svc.activeVersion}` : t('noActiveVersion') })
        )
      ),
      h('div', { class: 'dashboard-card-status' },
        h('span', { class: `state-pill ${st ? st.state : 'stopped'}` },
          h('span', { class: `dot ${st ? st.state : 'stopped'}` }),
          st ? stateLabel(st.state) : t('stopped')
        ),
        running && st.port && h('span', { class: 'chip ok', text: `Port: ${st.port}` })
      ),
      h('div', { class: 'dashboard-card-actions' },
        svcControls(svc.id, running),
        h('button', {
          class: 'btn btn-small btn-ghost',
          text: t('openFolder'),
          onclick: (e) => {
            e.stopPropagation();
            window.pamp.openDir(svc.id);
          }
        })
      )
    );
  });

  const servicesSection = h('section', { class: 'dashboard-section' },
    h('h2', { text: 'Active Services' }),
    h('div', { class: 'dashboard-grid' }, ...serviceCards)
  );

  // 3. Runtimes
  const runtimes = state.tools.filter(t => t.kind === 'runtime');
  const runtimeCards = runtimes.map(rt => {
    return h('div', { class: 'card dashboard-rt-card', style: `--accent:${rt.accent}`, onclick: () => select(rt.id) },
      renderToolBadge(rt),
      h('div', { class: 'dashboard-rt-info' },
        h('h3', { text: rt.name }),
        h('span', { class: 'muted', text: rt.activeVersion ? `Active: v${rt.activeVersion}` : t('noVersion') })
      )
    );
  });

  const runtimesSection = h('section', { class: 'dashboard-section' },
    h('h2', { text: 'Installed Runtimes' }),
    h('div', { class: 'dashboard-grid' }, ...runtimeCards)
  );

  // 4. Quick Actions / Links
  const quickLinks = h('section', { class: 'dashboard-section' },
    h('h2', { text: 'Quick Links' }),
    h('div', { class: 'dashboard-links' },
      h('button', { class: 'btn btn-ghost', onclick: () => window.pamp.openExternal('http://localhost') }, '🌐 Open Localhost (Port 80)'),
      h('button', { class: 'btn btn-ghost', onclick: () => select(SETTINGS_VIEW) }, '⚙ Open Settings'),
      h('button', { class: 'btn btn-ghost', onclick: () => setupPath() }, `🛠 ${t('addToPath')}`)
    )
  );

  root.replaceChildren(header, servicesSection, runtimesSection, quickLinks);
}

/* ---------------- detail pane ---------------- */

function renderDetail() {
  const root = $('#detail');
  if (state.selected === SETTINGS_VIEW) {
    root.className = '';
    renderSettings(root);
    return;
  }
  const tl = tool(state.selected);
  if (!tl) {
    renderDashboard(root);
    return;
  }
  root.className = '';
  const st = statusOf(tl.id);
  const running = !!(st && st.state === 'running');

  const header = h('div', { class: 'detail-header' },
    h('div', { class: 'detail-title' },
      renderToolBadge(tl, 'lg'),
      h('div', {},
        h('h1', { text: tl.name }),
        h('div', { class: 'detail-sub' },
          h('span', { text: tl.kind === 'service' ? t('servicePort', { port: tl.port }) : t('runtime') }),
          tl.activeVersion ? h('span', { class: 'chip', text: t('activeV', { v: tl.activeVersion }) })
                           : h('span', { class: 'chip warn', text: t('noActiveVersion') })))),
    h('div', { class: 'detail-actions' },
      tl.kind === 'service' && h('span', { class: `state-pill ${st ? st.state : 'stopped'}` },
        h('span', { class: `dot ${st ? st.state : 'stopped'}` }),
        st && st.state === 'running'
          ? `${t('running')}${st.pid ? ` · pid ${st.pid}` : ''}${st.managed === false ? ` · ${t('external')}` : ''}`
          : st && st.state === 'starting'
            ? t('starting', { name: tl.name })
            : st && st.state === 'error'
              ? `${t('errorState')} (Exit Code: ${st.code})`
              : t('stopped')),
      tl.kind === 'service' && svcControls(tl.id, running),
      h('button', { class: 'btn btn-ghost', text: t('openFolder'), onclick: () => window.pamp.openDir(tl.id) }))
  );

  const versionRows = tl.versions.map((v) =>
    h('tr', { class: v.active ? 'active-row' : '' },
      h('td', {}, h('span', { class: 'mono', text: v.name })),
      h('td', {}, v.valid
        ? h('span', { text: v.version ? `v${v.version}` : t('detected') })
        : h('span', { class: 'muted', text: t('noExe') })),
      h('td', { class: 'ta-right' }, v.active
        ? h('span', { class: 'chip ok', text: t('inUse') })
        : h('button', {
            class: 'btn btn-small',
            disabled: v.valid ? null : 'disabled',
            text: t('use'),
            onclick: () => activate(tl.id, v.name),
          })))
  );

  const versionsCard = h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', { text: t('versions') }),
      h('span', { class: 'muted', text: tl.dir })),
    tl.versions.length
      ? h('table', { class: 'ver-table' },
          h('thead', {}, h('tr', {},
            h('th', { text: t('thFolder') }), h('th', { text: t('thDetected') }), h('th', {}))),
          h('tbody', {}, ...versionRows))
      : h('div', { class: 'placeholder' },
          h('p', { text: t('noVersionsYet') }),
          h('p', { class: 'muted', text: t('installHint', { name: tl.name, dir: tl.dir }) }))
  );

  const downloadCard = renderDownloadCard(tl);

  const logsCard = tl.kind === 'service'
    ? h('section', { class: 'card grow' },
        h('div', { class: 'card-head' },
          h('h2', { text: t('logs') }),
          h('div', { style: 'display: flex; align-items: center; gap: 14px;' },
            h('label', { class: 'follow' },
              h('input', { type: 'checkbox', checked: state.logsFollow ? 'checked' : null,
                onchange: (e) => { state.logsFollow = e.target.checked; } }),
              t('follow')),
            h('button', {
              class: 'btn btn-small btn-ghost',
              text: t('clearLogs'),
              onclick: async () => {
                await window.pamp.clearLogs(tl.id);
                const view = $('#log-view');
                if (view) view.textContent = '';
                toast(t('logsCleared', { name: tl.name }), 'ok');
              }
            }))),
        h('pre', { id: 'log-view', class: 'logs' }))
    : null;

  const phpCards = renderPhpCards(tl);
  const nodeCards = renderNodeCards(tl);

  root.replaceChildren(...[header, versionsCard, downloadCard, ...phpCards, ...nodeCards, logsCard].filter(Boolean));
  if (logsCard) loadLogs(tl.id);
}

/* ---------------- php extensions + config ---------------- */

async function loadPhpInfo() {
  try {
    const [info, composer] = await Promise.all([window.pamp.phpInfo(), window.pamp.composerStatus()]);
    state.phpInfo = info;
    state.composer = composer;
  } catch {
    state.phpInfo = { available: false };
  }
  if (state.selected === 'php') renderDetail();
}

async function togglePhpExtension(name, enabled) {
  try {
    await window.pamp.phpSetExtension(name, enabled);
    // Reflect the change locally so the checkbox stays in sync without a reload.
    const ext = state.phpInfo.extensions.find((e) => e.name === name);
    if (ext) ext.enabled = enabled;
    toast(t(enabled ? 'extEnabled' : 'extDisabled', { name }), 'ok');
  } catch (err) {
    toast(t('extFailed', { name, msg: err.message }), 'err');
    renderDetail(); // revert the checkbox to its real state
  }
}

function renderPhpExtensionsCard() {
  const info = state.phpInfo;
  const head = h('div', { class: 'card-head' },
    h('h2', { text: t('phpExtensions') }),
    h('button', {
      class: 'link-btn',
      text: state.phpManage ? t('manageDone') : t('manageExt'),
      onclick: () => { state.phpManage = !state.phpManage; renderDetail(); },
    }));

  if (state.phpManage) {
    const items = (info.extensions || []).slice();
    const body = items.length
      ? h('div', { class: 'ext-manage-list' },
          ...items.map((ext) =>
            h('label', { class: 'ext-toggle' },
              h('input', {
                type: 'checkbox',
                checked: ext.enabled ? 'checked' : null,
                onchange: (e) => togglePhpExtension(ext.name, e.target.checked),
              }),
              h('span', { class: 'mono', text: ext.name }))))
      : h('div', { class: 'muted', text: t('extNone') });
    return h('section', { class: 'card' }, head, body,
      h('div', { class: 'muted ext-hint', text: t('extRestartHint') }));
  }

  // View mode: chips of what's actually loaded (php -m), collapsed behind
  // "+N more" past the limit.
  const loaded = info.loaded && info.loaded.length
    ? info.loaded
    : (info.extensions || []).filter((e) => e.enabled).map((e) => e.name);
  const shown = state.phpExpanded ? loaded : loaded.slice(0, PHP_CHIP_LIMIT);
  const hidden = loaded.length - shown.length;

  const chips = shown.map((name) =>
    h('span', { class: 'ext-chip' }, h('span', { class: 'ext-dot' }), name));
  if (hidden > 0) {
    chips.push(h('span', {
      class: 'ext-chip ext-more', text: t('extMore', { n: hidden }),
      onclick: () => { state.phpExpanded = true; renderDetail(); },
    }));
  } else if (state.phpExpanded && loaded.length > PHP_CHIP_LIMIT) {
    chips.push(h('span', {
      class: 'ext-chip ext-more', text: t('extLess'),
      onclick: () => { state.phpExpanded = false; renderDetail(); },
    }));
  }

  return h('section', { class: 'card' }, head, h('div', { class: 'ext-chips' }, ...chips));
}

function renderPhpConfigCard() {
  const info = state.phpInfo;
  const configRow = (label, value, ...actions) =>
    h('div', { class: 'config-row' },
      h('div', { class: 'config-label', text: label }),
      h('div', { class: 'config-val mono', title: value, text: value }),
      h('div', { class: 'config-actions' }, ...actions));

  const open = (which) => window.pamp.phpOpen(which).catch((err) => toast(err.message, 'err'));

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', { text: t('phpConfig') })),
    configRow(t('phpIni'), info.iniPath,
      iconBtn(ICON_PENCIL, t('editTitle'), () => open('ini'))),
    configRow(t('phpExtDir'), info.extDir,
      iconBtn(ICON_FOLDER, t('openFolderTitle'), () => open('extDir')),
      iconBtn(ICON_PENCIL, t('editTitle'), () => open('ini'))),
    configRow(t('phpErrorLog'), info.errorLog,
      h('button', { class: 'btn btn-small', text: t('view'), onclick: () => open('errorLog') })));
}

/* ---------------- php quick tools ---------------- */

async function runQuick(task, fn, doneMsg) {
  if (state.quickBusy[task]) return;
  state.quickBusy[task] = t('qtWorking');
  renderDetail();
  try {
    await fn();
    if (doneMsg) toast(doneMsg(), 'ok');
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    delete state.quickBusy[task];
    renderDetail();
  }
}

async function createLaravelProject() {
  const name = (state.laravelName || '').trim();
  if (!name) { toast(t('qtNeedName'), 'err'); return; }
  state.quickLog = [];
  await runQuick('laravel', async () => {
    const r = await window.pamp.createLaravel({ dir: state.laravelDir || '', name });
    toast(t('qtLaravelDone', { path: r.path }), 'ok');
    state.laravelForm = false;
  });
}

// Progress events from Composer / phpMyAdmin update the tile's subtext in place
// so a long download doesn't re-render the whole pane on every chunk.
function onQuickProgress(p) {
  const label = p.phase === 'extract'
    ? t('dlExtracting')
    : t('dlDownloading', { pct: p.total ? Math.round((p.received / p.total) * 100) : 0 });
  state.quickBusy[p.task] = label;
  const el = $(`#qsub-${p.task}`);
  if (el) el.textContent = label;
}

function onQuickLog(p) {
  state.quickLog.push(p.line);
  if (state.quickLog.length > 400) state.quickLog.splice(0, state.quickLog.length - 400);
  const pre = $('#quick-log');
  if (pre) { pre.textContent = state.quickLog.join('\n'); pre.scrollTop = pre.scrollHeight; }
  else if (state.selected === 'php') renderDetail();
}

function quickTile(task, logo, title, sub, onclick) {
  const busy = state.quickBusy[task];
  return h('button', {
    class: `quick-tile ${busy ? 'busy' : ''}`,
    disabled: busy ? 'disabled' : null,
    onclick,
  },
    h('span', { class: 'quick-icon' }, h('img', { class: 'quick-logo', src: `logos/${logo}.svg`, alt: title })),
    h('span', { class: 'quick-body' },
      h('span', { class: 'quick-title', text: title }),
      h('span', { class: 'quick-sub', id: busy ? `qsub-${task}` : null, text: busy || sub })));
}

function renderLaravelForm() {
  return h('div', { class: 'laravel-form' },
    h('input', {
      class: 'q-input', type: 'text', placeholder: t('qtProjectName'),
      value: state.laravelName || '',
      oninput: (e) => { state.laravelName = e.target.value; },
    }),
    h('button', {
      class: 'btn btn-small', text: state.laravelDir || t('qtChooseFolder'),
      onclick: async () => { const d = await window.pamp.pickFolder(); if (d) { state.laravelDir = d; renderDetail(); } },
    }),
    h('button', { class: 'btn btn-primary btn-small', text: t('qtCreate'), onclick: () => createLaravelProject() }));
}

function renderQuickToolsCard() {
  const comp = state.composer;
  const composerTitle = comp && comp.installed
    ? t('qtComposerInstalled', { v: comp.version || '?' })
    : t('qtComposer');

  const grid = h('div', { class: 'quick-grid' },
    quickTile('phpinfo', 'php', t('qtPhpinfo'), t('qtPhpinfoSub'),
      () => runQuick('phpinfo', () => window.pamp.quickPhpinfo())),
    quickTile('composer', 'composer', composerTitle, t('qtComposerSub'),
      () => runQuick('composer', async () => {
        const r = await window.pamp.installComposer();
        state.composer = { installed: true, version: r.version };
      }, () => t('qtComposerDone', { v: (state.composer && state.composer.version) || '' }))),
    quickTile('laravel', 'laravel', t('qtLaravel'), t('qtLaravelSub'),
      () => { state.laravelForm = !state.laravelForm; renderDetail(); }),
    quickTile('pma', 'phpmyadmin', t('qtPma'), t('qtPmaSub'),
      () => runQuick('pma', () => window.pamp.openPhpMyAdmin(), () => t('qtNeedMysql'))));

  const children = [h('div', { class: 'card-head' }, h('h2', { text: t('quickTools') })), grid];
  if (state.laravelForm) children.push(renderLaravelForm());
  if (state.quickLog.length) children.push(h('pre', { id: 'quick-log', class: 'quick-log', text: state.quickLog.join('\n') }));
  return h('section', { class: 'card' }, ...children);
}

// The PHP-only extensions + configuration cards, or null for other tools /
// while info is still loading / when no version is active.
function renderPhpCards(tl) {
  if (tl.id !== 'php') return [];
  const info = state.phpInfo;
  if (info === undefined) {
    return [h('section', { class: 'card' }, h('div', { class: 'muted', text: t('loading') }))];
  }
  if (!info.available) {
    return [h('section', { class: 'card' },
      h('div', { class: 'placeholder' }, h('p', { class: 'muted', text: t('phpNoActive') })))];
  }
  return [renderPhpExtensionsCard(), renderPhpConfigCard(), renderQuickToolsCard()];
}

/* ---------------- node global packages ---------------- */

async function loadNodeInfo() {
  try {
    state.nodeInfo = await window.pamp.nodeInfo();
  } catch {
    state.nodeInfo = { available: false };
  }
  if (state.selected === 'node') renderDetail();
}

async function nodePkgAction(pkg, installed) {
  if (state.nodeBusy[pkg]) return;
  state.nodeBusy[pkg] = true;
  state.nodeLog = [];
  renderDetail();
  try {
    if (installed) {
      await window.pamp.nodeUninstall(pkg);
      toast(t('pkgRemoveDone', { name: pkg }), 'ok');
    } else {
      await window.pamp.nodeInstall(pkg);
      toast(t('pkgInstallDone', { name: pkg }), 'ok');
    }
  } catch (err) {
    toast(t('pkgFailed', { name: pkg, msg: err.message }), 'err');
  } finally {
    delete state.nodeBusy[pkg];
    await loadNodeInfo();
  }
}

function onNodeLog(p) {
  state.nodeLog.push(p.line);
  if (state.nodeLog.length > 400) state.nodeLog.splice(0, state.nodeLog.length - 400);
  const pre = $('#node-log');
  if (pre) { pre.textContent = state.nodeLog.join('\n'); pre.scrollTop = pre.scrollHeight; }
  else if (state.selected === 'node') renderDetail();
}

// The Node-only global packages card, or nothing for other tools / while info
// is still loading / when no version is active.
function renderNodeCards(tl) {
  if (tl.id !== 'node') return [];
  const info = state.nodeInfo;
  if (info === undefined) {
    return [h('section', { class: 'card' }, h('div', { class: 'muted', text: t('loading') }))];
  }
  if (!info.available) {
    return [h('section', { class: 'card' },
      h('div', { class: 'placeholder' }, h('p', { class: 'muted', text: t('nodeNoActive') })))];
  }

  const tiles = (info.packages || []).map((p) => {
    const busy = state.nodeBusy[p.name];
    return h('div', { class: `quick-tile pkg-tile ${busy ? 'busy' : ''}` },
      h('span', { class: 'quick-icon' }, h('img', { class: 'quick-logo', src: `logos/${p.logo}.svg`, alt: p.name })),
      h('span', { class: 'quick-body' },
        h('span', { class: 'quick-title' },
          p.name,
          p.installed && p.version ? h('span', { class: 'chip ok pkg-ver', text: `v${p.version}` }) : null),
        h('span', { class: 'quick-sub', text: busy ? t('qtWorking') : p.desc })),
      h('button', {
        class: `btn btn-small ${p.installed ? 'btn-ghost' : 'btn-primary'} pkg-action`,
        disabled: busy ? 'disabled' : null,
        text: p.installed ? t('pkgRemove') : t('pkgInstall'),
        onclick: () => nodePkgAction(p.name, p.installed),
      }));
  });

  const children = [
    h('div', { class: 'card-head' },
      h('h2', { text: t('nodePackages') }),
      h('span', { class: 'muted', text: t('nodePackagesSub') })),
    h('div', { class: 'quick-grid' }, ...tiles),
  ];
  if (state.nodeLog.length) {
    children.push(h('pre', { id: 'node-log', class: 'quick-log', text: state.nodeLog.join('\n') }));
  }
  return [h('section', { class: 'card' }, ...children)];
}

/* ---------------- download card ---------------- */

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

function dlProgressText(p) {
  if (p.phase === 'extract') return t('dlExtracting');
  const size = p.total ? ` (${fmtMB(p.received)} / ${fmtMB(p.total)} MB)` : ` (${fmtMB(p.received)} MB)`;
  return t('dlDownloading', { pct: p.pct }) + size;
}

function renderDownloadCard(tl) {
  const list = state.dlLists[tl.id];
  const active = state.dlActive[tl.id];
  let body;

  if (active) {
    body = h('div', { class: 'dl-progress' },
      h('div', { class: 'dl-bar-track' },
        h('div', { id: 'dl-bar', class: 'dl-bar', style: `width:${active.phase === 'extract' ? 100 : active.pct}%` })),
      h('div', { id: 'dl-status', class: 'muted', text: dlProgressText(active) }));
  } else if (list === 'loading') {
    body = h('div', { class: 'muted', text: t('dlLoading') });
  } else if (list instanceof Error) {
    body = h('div', { class: 'dl-row' },
      h('span', { class: 'muted', text: t('dlListFailed', { msg: list.message }) }),
      h('button', { class: 'btn btn-small', text: t('dlLoad'), onclick: () => loadDlList(tl.id) }));
  } else if (Array.isArray(list)) {
    if (!list.length) {
      body = h('div', { class: 'muted', text: t('dlEmpty') });
    } else {
      const sel = h('select', { id: 'dl-select', class: 'dl-select' },
        ...list.map((i) => h('option', { value: i.version, text: i.label })));
      body = h('div', { class: 'dl-row' }, sel,
        h('button', { class: 'btn btn-primary', text: t('dlInstall'), onclick: () => installVersion(tl.id, sel.value) }));
    }
  } else {
    body = h('div', { class: 'dl-row' },
      h('button', { class: 'btn', text: t('dlLoad'), onclick: () => loadDlList(tl.id) }));
  }

  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h2', { text: t('download') }),
      h('span', { class: 'muted', text: t('dlSource') })),
    body);
}

async function loadDlList(toolId) {
  state.dlLists[toolId] = 'loading';
  if (state.selected === toolId) renderDetail();
  try {
    state.dlLists[toolId] = await window.pamp.dlList(toolId);
  } catch (err) {
    state.dlLists[toolId] = new Error(err.message);
  }
  if (state.selected === toolId) renderDetail();
}

async function installVersion(toolId, version) {
  state.dlActive[toolId] = { version, phase: 'download', pct: 0, received: 0, total: 0 };
  if (state.selected === toolId) renderDetail();
  try {
    const res = await window.pamp.dlInstall(toolId, version);
    delete state.dlActive[toolId];
    toast(t(res.activated ? 'dlDoneActive' : 'dlDone', { name: tool(toolId).name, v: version }), 'ok');
    await refresh();
  } catch (err) {
    delete state.dlActive[toolId];
    toast(t('dlFailed', { msg: err.message }), 'err');
    if (state.selected === toolId) renderDetail();
  }
}

// Progress events update the bar in place; the card is only re-rendered on
// phase transitions so the <select> and buttons don't get rebuilt mid-install.
function onDlProgress(p) {
  const prev = state.dlActive[p.toolId];
  state.dlActive[p.toolId] = { version: p.version, phase: p.phase, pct: p.pct, received: p.received, total: p.total };
  if (state.selected !== p.toolId) return;
  if (!prev || prev.phase !== p.phase) { renderDetail(); return; }
  const bar = $('#dl-bar');
  const status = $('#dl-status');
  if (bar) bar.style.width = `${p.phase === 'extract' ? 100 : p.pct}%`;
  if (status) status.textContent = dlProgressText(state.dlActive[p.toolId]);
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

async function loadLogs(toolId) {
  const entries = await window.pamp.getLogs(toolId);
  const view = $('#log-view');
  if (!view || state.selected !== toolId) return;
  view.textContent = entries.map((e) => `[${fmtTime(e.ts)}] ${e.line}`).join('\n');
  if (state.logsFollow) view.scrollTop = view.scrollHeight;
}

function appendLog({ toolId, ts, line }) {
  if (state.selected !== toolId) return;
  const view = $('#log-view');
  if (!view) return;
  view.textContent += (view.textContent ? '\n' : '') + `[${fmtTime(ts)}] ${line}`;
  if (state.logsFollow) view.scrollTop = view.scrollHeight;
}

/* ---------------- actions ---------------- */

function select(id) {
  state.selected = id;
  if (id === 'php') {
    // Reset the PHP panel to a clean loading state, then fetch fresh info.
    state.phpInfo = undefined;
    state.phpManage = false;
    state.phpExpanded = false;
  }
  if (id === 'node') state.nodeInfo = undefined;
  renderSidebar();
  renderDetail();
  if (id === 'php') loadPhpInfo();
  if (id === 'node') loadNodeInfo();
}

async function refresh(keepSelection = true) {
  const prev = keepSelection ? state.selected : null;
  [state.tools, state.status] = await Promise.all([window.pamp.listTools(), window.pamp.statusAll()]);
  state.selected = prev && (prev === SETTINGS_VIEW || tool(prev))
    ? prev
    : (state.tools[0] && state.tools[0].id);
  renderSidebar();
  renderDetail();
  // The active PHP version (and thus its ini/extensions) may have changed.
  if (state.selected === 'php') loadPhpInfo();
  // Same for Node: another version means a different set of global packages.
  if (state.selected === 'node') loadNodeInfo();
}

async function refreshStatusOnly() {
  state.status = await window.pamp.statusAll();
  renderSidebar();
  // Only re-render the detail pane if the shown service flipped state,
  // so the logs pane doesn't flicker every poll.
  const tl = tool(state.selected);
  if (tl && tl.kind === 'service') {
    const pill = $('.state-pill');
    if (pill) {
      const currentState = state.status[tl.id] ? state.status[tl.id].state : 'stopped';
      if (!pill.classList.contains(currentState)) {
        renderDetail();
      }
    }
  }
}

async function activate(toolId, versionName) {
  try {
    await window.pamp.activate(toolId, versionName);
    toast(t('nowUsing', { name: tool(toolId).name, v: versionName }), 'ok');
    await refresh();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function startService(toolId) {
  try {
    toast(t('starting', { name: tool(toolId).name }));
    await window.pamp.startService(toolId);
    setTimeout(refreshStatusOnly, 800);
    setTimeout(refreshStatusOnly, 2500);
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function stopService(toolId) {
  try {
    toast(t('stopping', { name: tool(toolId).name }));
    await window.pamp.stopService(toolId);
    await refreshStatusOnly();
  } catch (err) {
    toast(err.message, 'err');
  }
}

// stop() resolves only once the port is free, so chaining start right after
// is safe.
async function restartService(toolId) {
  try {
    toast(t('restarting', { name: tool(toolId).name }));
    await window.pamp.stopService(toolId);
    await refreshStatusOnly();
    await window.pamp.startService(toolId);
    setTimeout(refreshStatusOnly, 800);
    setTimeout(refreshStatusOnly, 2500);
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function setupPath() {
  const btn = $('#btn-path-setup');
  btn.disabled = true;
  try {
    const entries = await window.pamp.pathSetup();
    const missing = entries.filter((e) => !e.present).length;
    toast(missing === 0 ? t('pathOk') : t('pathPartial', { n: missing }),
          missing === 0 ? 'ok' : 'err');
  } catch (err) {
    toast(t('pathFailed', { msg: err.message }), 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- boot ---------------- */

(async () => {
  try {
    state.settings = await window.pamp.getSettings();
  } catch { /* fall back to defaults */ }
  applyTheme();
  renderStatic();
  window.pamp.onLog(appendLog);
  window.pamp.onDlProgress(onDlProgress);
  window.pamp.onQuickProgress(onQuickProgress);
  window.pamp.onQuickLog(onQuickLog);
  window.pamp.onNodeLog(onNodeLog);
  $('#btn-refresh').addEventListener('click', () => refresh());
  $('#btn-path-setup').addEventListener('click', setupPath);
  $('#btn-settings').addEventListener('click', () => select(SETTINGS_VIEW));
  $('#win-btn-minimize').addEventListener('click', () => window.pamp.minimize());
  $('#win-btn-maximize').addEventListener('click', () => window.pamp.maximize());
  $('#win-btn-close').addEventListener('click', () => window.pamp.close());
  setInterval(refreshStatusOnly, 5000);
  await refresh();
})();
