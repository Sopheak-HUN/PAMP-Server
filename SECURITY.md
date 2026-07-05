# Security Policy

## Supported versions

Only the latest release receives security fixes.

| Version | Supported |
| --- | --- |
| latest release | ✅ |
| older releases | ❌ |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

- Use GitHub's private reporting: **Security → Report a vulnerability** on
  [github.com/Sopheak-HUN/PAMP-Server](https://github.com/Sopheak-HUN/PAMP-Server/security), or
- Email **turbotech.kh@gmail.com** with steps to reproduce.

You should get a first response within a few days. Please give us a reasonable
window to ship a fix before disclosing publicly.

## Security model

PAMP is a **local development** tool. It manages developer runtimes and
services on the user's own machine and is not designed to be exposed to a
network or used in production.

### Deliberately insecure local-dev defaults

These are *by design* for a friction-free localhost workflow and are **not**
considered vulnerabilities on their own:

- MySQL is initialized with `--initialize-insecure` (root, empty password).
- PostgreSQL is initialized with `trust` auth (superuser `postgres`, no password).
- Redis runs with no password.
- phpMyAdmin is configured with `AllowNoPassword`.
- The phpinfo / phpMyAdmin helper servers (`php -S`) bind to `127.0.0.1` on a
  random free port.

**Do not** port-forward these services or run PAMP on a machine where other
untrusted users share localhost access.

### What PAMP itself does

- **Downloads** run over HTTPS from official sources only (windows.php.net,
  nodejs.org, nuget.org, cdn.mysql.com, EnterpriseDB, nginx.org, Microsoft,
  Adoptium, GitHub releases for Redis, getcomposer.org, phpmyadmin.net,
  start.spring.io). Archives are not currently signature-verified — treat the
  `bin\` folder with the same trust as anything you download yourself.
- **Scaffolds and package installs** execute real package managers
  (npm / Composer / pip). Anything those ecosystems can run, these tools can
  run too — the same as invoking them in a terminal.
- **Electron hardening**: the renderer runs with `contextIsolation: true`,
  `nodeIntegration: false`, a minimal `contextBridge` API, and loads only
  local files; no remote content is ever loaded into the window.
- **PATH changes** touch the *user* PATH only (never system-wide, no admin).
- **Filesystem writes** stay inside the stack root (`bin\`, `data\`, `www\`,
  `settings.json`) plus the OS temp folder for downloads.
- The app never phones home: no telemetry, no auto-update, network requests
  happen only for the actions listed above.

### In scope for reports

Examples of things we absolutely want to hear about:

- Command or argument injection through project names, folder pickers or
  settings values.
- Path traversal escaping the stack root (e.g. via a crafted zip).
- Renderer → main privilege escalation through the IPC surface.
- Downloads that can be redirected to non-official hosts.
