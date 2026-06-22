// After `next build`, Next's standalone output omits the static assets and the
// public/ folder — they have to be copied in next to server.js. This script
// does that staging so `.next/standalone` is a runnable, self-contained server
// (used by both `pnpm app:dev` and the electron-builder package step).

import { cp, access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function exists(p) {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(path.join(standalone, "server.js")))) {
  console.error(
    "✗ .next/standalone/server.js not found — run `next build` first.",
  );
  process.exit(1);
}

// .next/static → .next/standalone/.next/static
await cp(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  { recursive: true },
);

// public → .next/standalone/public (if present)
if (await exists(path.join(root, "public"))) {
  await cp(path.join(root, "public"), path.join(standalone, "public"), {
    recursive: true,
  });
}

// Prune anything Next's file tracer may have copied into the standalone that the
// server doesn't need at runtime. Most important: `dist-app/` — the
// electron-builder output (incl. the previous multi-GB .dmg) — which otherwise
// nests recursively and bloats the bundle. Belt-and-suspenders alongside the
// outputFileTracingExcludes in next.config.ts.
const PRUNE = [
  "dist-app",
  "src",
  "docs",
  "scripts",
  "drizzle", // shipped separately via electron-builder extraResources
  "build",
  "README.md",
  "CLAUDE_CONTEXT.md",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.tsbuildinfo",
  "vitest.config.ts",
  "postcss.config.mjs",
  path.join(".next", "cache"),
];
let pruned = 0;
for (const rel of PRUNE) {
  const target = path.join(standalone, rel);
  if (await exists(target)) {
    await rm(target, { recursive: true, force: true });
    pruned += 1;
  }
}

console.log(
  `✓ Staged static assets + public/ into .next/standalone (pruned ${pruned} build artifact(s))`,
);
