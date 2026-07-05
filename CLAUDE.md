# CLAUDE.md

## Project

PAMP — portable dev-stack version manager and service control panel for
Windows (Electron). Manages PHP, Node.js, Python, Java, .NET, MySQL,
PostgreSQL, Nginx and Redis under a portable `bin/` folder. Version switching
works by flipping a folder junction (`bin\<tool>\current`). UI is bilingual
(English/Khmer) with light/dark themes.

## Commands

- `npm run build:css` — compile Tailwind (ui/input.css → ui/styles.css)
- `npm run watch:css` — Tailwind watch mode
- `npm start` — build CSS, then launch Electron (Windows-targeted; GUI won't run under WSL)
- `npm run dist` — build Windows portable + NSIS installers (electron-builder)

No test suite or linter configured.

## Architecture

- `main.js` — Electron main process: window/tray lifecycle, IPC handlers,
  stack-root resolution (PAMP_ROOT env → portable exe dir → packaged exe dir → dev folder)
- `preload.js` — the entire renderer API surface via contextBridge
  (`window.pamp.*`). contextIsolation on, nodeIntegration off — keep it that way.
- `src/` — main-process modules:
  - `toolsConfig.js` — registry of managed tools (exe paths, version detection, ports)
  - `versionManager.js` — install/switch versions via `current` junctions
  - `serviceManager.js` — start/stop MySQL, PostgreSQL, Nginx, Redis + live logs
  - `pathManager.js` — user PATH integration
  - `settingsManager.js` — app settings (root `settings.json` in dev, stack root when packaged)
  - `downloadManager.js`, `phpManager.js`, `nodeManager.js`, `quickTools.js`, `scaffold.js`
- `ui/` — renderer: plain HTML/JS (`index.html`, `renderer.js`), Tailwind CSS 4.
  Never edit `ui/styles.css` directly — it is generated from `ui/input.css`.

## Notes

- Target platform is Windows: code assumes junctions, `.exe` paths, NSIS.
  On WSL, CSS builds work; running the app requires Windows.
- Root `settings.json` is the app's own runtime config, not tooling config.
