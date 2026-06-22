# Questline — macOS Desktop App

Questline can run as a normal **double-click macOS app** — no terminal, no
Docker, no database server. It's an Electron shell wrapping the Next.js
production server, with the database embedded as a file (PGlite). Everything
stays 100% local.

## What's bundled vs. external

| Piece | How it ships |
|-------|--------------|
| App UI + server (Next.js) | Bundled inside the `.app` (`.next/standalone`) |
| Database (PostgreSQL) | **Embedded** — PGlite, an in-process Postgres. Lives in a file. No Docker. |
| Your data | `~/Library/Application Support/Questline/db/` |
| Local AI (Ollama) | **External** — install separately (see below). Optional; everything except the AI features works without it. |

Ollama isn't bundled because its models are multiple GB. The app detects it and
the in-app health banner tells you if it's missing.

## Build the app

Prerequisites: Node 20+, pnpm, and the deps installed (`pnpm install`).

```bash
pnpm app:dist
```

This runs `next build`, stages the standalone server, and packages a signed-ad-hoc
`.dmg` into `dist-app/`. Double-click the `.dmg`, drag **Questline** to
Applications, and launch it.

Because it's an unsigned (ad-hoc) build, the first launch may need:
**right-click → Open** (or System Settings → Privacy & Security → "Open Anyway").
To distribute to other people, sign it with a Developer ID certificate (remove
`mac.identity: null` in `electron-builder.yml`).

## Run the app without packaging (dev)

```bash
pnpm app:prepare   # next build + stage the standalone server
pnpm app:dev       # launches Electron against the staged build
```

## Enable the local AI (optional)

```bash
brew install ollama
ollama serve            # or launch the Ollama menu-bar app
ollama pull qwen2.5:14b # the model Questline uses by default
```

With Ollama running, the AI features (epic break-down, chapter-board planner,
weekly coach, notes→JSON) work fully offline.

## How it works (for maintainers)

- `src/server/db/index.ts` picks the backend at runtime:
  - `QUESTLINE_EMBEDDED=1` → PGlite at `QUESTLINE_DATA_DIR` (the desktop app).
  - otherwise → PostgreSQL via `DATABASE_URL` (normal `pnpm dev`).
- `src/instrumentation.ts` applies the Drizzle migrations to the PGlite store on
  first boot (`ensureEmbeddedMigrations()`), then warms Ollama.
- `next.config.ts` emits `output: "standalone"` and force-includes the PGlite
  WASM assets via `outputFileTracingIncludes`.
- `electron/main.js` forks the standalone `server.js` as Electron-as-Node
  (`ELECTRON_RUN_AS_NODE`), points it at an embedded DB in `userData`, generates
  a stable per-install `BETTER_AUTH_SECRET`, waits for the port, and opens the
  window.
- `electron-builder.yml` ships the server + migrations as `extraResources`
  (plain files, so they can be forked) and keeps only the shell in the asar.

The regular Docker + Postgres dev workflow (`pnpm dev`, `pnpm db:up`) is
unchanged.
