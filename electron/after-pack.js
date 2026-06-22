// electron-builder's file matcher strips dot-dirs (like `.next`) and prunes
// node_modules when copying via `extraResources`. The Next standalone server
// needs BOTH verbatim, so we copy it ourselves here.
//
// We use `cp -R` (not Node's fs.cp): the standalone tree contains pnpm's
// relative symlink graph, and fs.cp with `dereference` recurses cyclically on
// it. `cp -R` preserves the (self-contained, relative) symlinks as-is.

const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const productName = packager.appInfo.productFilename; // "Questline"
  const resources = path.join(
    appOutDir,
    `${productName}.app`,
    "Contents",
    "Resources",
  );
  const src = path.join(packager.projectDir, ".next", "standalone");
  const dest = path.join(resources, "standalone");

  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(resources, { recursive: true });
  execFileSync("cp", ["-R", src, dest], { stdio: "inherit" });
  console.log(`[afterPack] copied Next standalone server → ${dest}`);
};
