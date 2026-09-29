import assert from "node:assert/strict";
import { test } from "node:test";
import { getBuildInfo } from "./build-info.mjs";

const env = {
  IOTGW_BUILD_REVISION: "a".repeat(40),
  IOTGW_BUILD_RELEASE: "v1.2.3",
  IOTGW_BUILD_DIRTY: "false",
  SECRET: "must-never-be-exported",
};

test("CI stamps the immutable source identity, not the workspace package version", () => {
  const build = getBuildInfo("frontend", { env });
  assert.equal(build.revision, env.IOTGW_BUILD_REVISION);
  assert.equal(build.release, "v1.2.3");
  assert.equal(build.dirty, false);
  assert.ok(!JSON.stringify(build).includes(env.SECRET));
});

test("dirty, unknown and development builds cannot claim a release tag", () => {
  for (const dirty of ["true", "unknown"]) {
    assert.equal(
      getBuildInfo("backend", { env: { ...env, IOTGW_BUILD_DIRTY: dirty } })
        .release,
      null,
    );
  }
  assert.equal(
    getBuildInfo("frontend", { env, development: true }).release,
    null,
  );
  assert.equal(
    getBuildInfo("frontend", { env: { ...env, IOTGW_BUILD_DIRTY: "unknown" } })
      .dirty,
    null,
  );
});

test("unrecognized source identifiers are not advertised as a Git build or release", () => {
  const build = getBuildInfo("backend", {
    env: {
      ...env,
      IOTGW_BUILD_REVISION: "main",
      IOTGW_BUILD_RELEASE: "latest",
    },
  });
  assert.equal(build.revision, null);
  assert.equal(build.release, null);
  assert.equal(
    getBuildInfo("frontend", { env: { ...env, IOTGW_BUILD_REVISION: "main" } })
      .release,
    null,
  );
});
