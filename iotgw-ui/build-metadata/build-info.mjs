import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const releasePattern =
  /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Only build provenance is exported. Never serialize process.env. */
export function getBuildInfo(
  component,
  { development = false, env = process.env } = {},
) {
  const git = (...args) => {
    try {
      return execFileSync("git", args, {
        cwd: workspace,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      }).trim();
    } catch {
      return null;
    }
  };
  const revision = env.IOTGW_BUILD_REVISION || git("rev-parse", "HEAD");
  const validRevision =
    revision && /^[a-f0-9]{40,64}$/.test(revision) ? revision : null;
  const changes =
    env.IOTGW_BUILD_DIRTY === undefined
      ? git("status", "--porcelain", "--untracked-files=normal", "--", ".")
      : null;
  const dirty =
    env.IOTGW_BUILD_DIRTY === undefined
      ? changes === null
        ? null
        : changes.length > 0
      : env.IOTGW_BUILD_DIRTY === "true"
        ? true
        : env.IOTGW_BUILD_DIRTY === "false"
          ? false
          : null;
  const release =
    env.IOTGW_BUILD_RELEASE ||
    git("describe", "--tags", "--exact-match", "HEAD");
  const packagePath =
    component === "frontend"
      ? "apps/app/package.json"
      : "apps/backend/package.json";
  const { version } = JSON.parse(
    readFileSync(new URL(`../${packagePath}`, import.meta.url), "utf8"),
  );
  return {
    component,
    version,
    revision: validRevision,
    release:
      !development &&
      validRevision &&
      dirty === false &&
      release &&
      releasePattern.test(release)
        ? release
        : null,
    builtAt: new Date().toISOString(),
    dirty,
    development,
  };
}
