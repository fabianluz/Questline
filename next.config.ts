import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle (`.next/standalone`) so the desktop
  // (Electron) build can run the app without the full node_modules tree.
  output: "standalone",

  // This repo has a pnpm workspace, so Next would otherwise infer the *workspace*
  // root as the file-tracing root and copy the entire tree — including the
  // multi-GB `dist-app/` build output — into `.next/standalone`. Pin the trace
  // root to this project and exclude build artifacts so the standalone bundle
  // (and thus the .dmg) stays slim.
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    "**": ["dist-app/**", "**/*.dmg", "**/*.tsbuildinfo", ".next/cache/**"],
  },

  // PGlite ships WASM + a data blob that Next's file tracer doesn't pick up on
  // its own. Force them into the standalone output so the embedded database
  // works inside the packaged app.
  outputFileTracingIncludes: {
    "**": [
      "./node_modules/@electric-sql/pglite/dist/*.wasm",
      "./node_modules/@electric-sql/pglite/dist/*.data",
    ],
  },

  // PGlite (WASM) and postgres-js must stay external so the bundler doesn't try
  // to inline their native/WASM bits.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
