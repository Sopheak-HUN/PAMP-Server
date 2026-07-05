# PAMP — Dev Stack Control Panel

Portable version manager and service control panel for Windows. Manage multiple
versions of PHP, Node.js, Python, MySQL, PostgreSQL, Nginx, .NET, Java and Redis from one
window, switch the active version per tool, and start/stop the server tools.

## Run

```
npm install
npm run start
```

## Downloading versions in-app

Every tool page has a **Download** card. Click *Show available versions*, pick
one, press *Install* — PAMP downloads it from the official source, shows
progress, extracts it into `bin\<tool>\<version>\`, and activates it
automatically if the tool had no active version yet.

Sources: windows.php.net, nodejs.org, python.org builds via nuget.org,
cdn.mysql.com, nginx.org, Microsoft (.NET release metadata), Adoptium
(Temurin JDK), and Redis Windows builds from GitHub
(tporadowski, redis-windows).

## Adding a tool version manually

Each tool has its own folder under `bin\`. Drop any number of versions in as
subfolders, then pick which one is active in the app:

1. Download a **portable / zip** Windows build of the tool
   (e.g. `php-8.3.1-Win32-vs16-x64.zip` from windows.php.net).
2. Extract it into a subfolder of the tool's directory, named however you like:
   `bin\php\8.3.1\`, `bin\node\v20\`, `bin\java\jdk-21\` …
   (a nested folder from the zip is fine — PAMP looks one level deep).
3. In the app, open the tool and click **Use** next to that version.

"Use" points the junction `bin\<tool>\current` at that version. Nothing else
on your system is touched, and switching is instant.

## PATH integration

Click **Add tools to PATH** once. It appends `bin\<tool>\current[\bin]` for
every tool to your **user** PATH (no admin needed). Because `current` is a
junction, switching versions in the app immediately changes what `php`,
`node`, `python`, `java` … resolve to in any *newly opened* terminal.

## Services (MySQL, PostgreSQL, Nginx, Redis)

- **Start/Stop** buttons manage the process; live output appears in the Logs pane.
- MySQL: the data directory is auto-initialized on first start at `data\mysql`
  (root user, empty password — local dev defaults).
- PostgreSQL: the data directory is auto-initialized on first start at
  `data\postgres` (superuser `postgres`, trust auth / no password — local dev
  defaults). Note: `postgres.exe` will not run if PAMP itself is launched as
  Administrator.
- Nginx runs with its prefix set to the active version folder (`-p`), so edit
  `bin\nginx\current\conf\nginx.conf` to configure sites.
- A service already running on its port (started outside PAMP) is detected and
  shown as `external`; Stop works on it too.

## Settings

The **⚙ Settings** button (bottom of the sidebar) opens two tabs.

**General**

- **Run PAMP when Windows starts** — registers a user login item (registry
  Run key via Electron); removed again when unchecked.
- **Run minimized** — the window starts minimized.
- **Start all services automatically** — on launch, every service with an
  active version is started (ones already running are left alone).
- **Document Root** — nginx web root. PAMP rewrites the `root` directive in
  `conf\nginx.conf` on the next start. Default web root: `<stack>\www`.
- **Data Directory** — where MySQL data and Redis dumps live
  (`<dir>\mysql`, `<dir>\redis`). Default: `<stack>\data`. Changing it does
  not move existing data; MySQL initializes fresh at the new location.

**Services & Ports** — per-service port settings (see below).

- **Theme** — dark or light.
- **Language** — English or Khmer (ខ្មែរ); the whole UI switches instantly.
  Khmer text renders in **Kantumruy Pro** (bundled in `ui\fonts\`, OFL license,
  from Google Fonts — no internet needed at runtime).
- **Service ports** — per-service port for MySQL, PostgreSQL, Nginx and Redis.
  Applied on the next start: MySQL via `--port`, PostgreSQL via `-p`, Redis via
  a CLI override after its conf, Nginx by rewriting the first `listen` directive
  in `conf\nginx.conf`. A service already running keeps its old port until
  restarted.

Choices persist in `settings.json` next to the app.

## Layout

The app code (this folder) and the managed stack can live apart. At startup
the app looks for `bin\` next to itself, then in its parent folder; the
`PAMP_ROOT` environment variable overrides detection.

```
PAMP\                       stack root
  bin\<tool>\<version>\     installed tool versions
  bin\<tool>\current        junction to the active version
  data\                     service data (e.g. MySQL data dir)
  PAMP-Server\              this app
    main.js                 Electron main process, IPC wiring
    preload.js              contextBridge API exposed to the UI
    src\toolsConfig.js      tool definitions (add new tools here)
    src\versionManager.js   version discovery + junction switching
    src\serviceManager.js   start/stop/status/logs for service tools
    src\pathManager.js      user PATH setup (PAMP entries first)
    src\settingsManager.js  theme/language persistence
    src\downloadManager.js  in-app version downloads
    ui\                     renderer (plain HTML/CSS/JS, no framework)
    settings.json           saved settings
```
