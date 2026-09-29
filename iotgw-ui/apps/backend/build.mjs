import { build } from "esbuild";
import { getBuildInfo } from "../../build-metadata/build-info.mjs";

await build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  outdir: "dist",
  sourcemap: true,
  define: { __BACKEND_BUILD_INFO__: JSON.stringify(getBuildInfo("backend")) },
});
