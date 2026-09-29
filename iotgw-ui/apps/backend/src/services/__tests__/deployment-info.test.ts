import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDeploymentInfo } from "../deployment-info";
import { miscRouter } from "../../routers/misc";
import { t } from "../../routers/trpc";
import type { Context } from "../../context";
import { TEST_OPERATOR } from "../../routers/__tests__/operator-ctx";

const manifest = {
  schemaVersion: 1,
  product: "Edge Manager",
  release: "v1.2.3",
  environment: "production",
  createdAt: "2026-09-29T10:00:00Z",
  components: ["frontend", "backend"].map((id) => ({
    id,
    name: id,
    version: "1.0.0",
    revision: "a".repeat(40),
    image: null,
    workload: null,
    observation: null,
  })),
};

describe("deployment identity metadata", () => {
  let directory: string;
  let path: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "iotgw-release-test-"));
    path = join(directory, "manifest.json");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reports missing, empty, invalid and oversized manifests without breaking the build identity", async () => {
    expect(await getDeploymentInfo(path)).toMatchObject({
      metadataStatus: "missing",
      manifest: null,
      backend: { component: "backend" },
    });
    await writeFile(path, "null");
    expect((await getDeploymentInfo(path)).metadataStatus).toBe("missing");
    for (const content of [
      "{broken",
      JSON.stringify({ ...manifest, components: [] }),
      JSON.stringify({ ...manifest, release: "latest" }),
      " ".repeat(256 * 1024 + 1),
    ]) {
      await writeFile(path, content);
      expect(await getDeploymentInfo(path)).toMatchObject({
        metadataStatus: "invalid",
        manifest: null,
      });
    }
  });

  it("picks up projected-file updates and strips fields outside the public identity contract", async () => {
    await writeFile(
      path,
      JSON.stringify({
        ...manifest,
        credentials: "secret",
        components: manifest.components.map((component) => ({
          ...component,
          env: { TOKEN: "secret" },
        })),
      }),
    );
    const result = await getDeploymentInfo(path);
    expect(result.manifest).toEqual(manifest);
    expect(JSON.stringify(result)).not.toContain("secret");
    await writeFile(path, JSON.stringify({ ...manifest, release: "v1.2.4" }));
    expect((await getDeploymentInfo(path)).manifest?.release).toBe("v1.2.4");
  });

  it("requires operator authentication without requiring a database call", async () => {
    const router = t.router(miscRouter);
    const unauthenticated = router.createCaller({
      auth: { ok: false, code: "UNAUTHORIZED" },
    } as Context);
    await expect(unauthenticated.getDeploymentInfo()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    const operator = router.createCaller({
      auth: { ok: true, operator: TEST_OPERATOR },
    } as Context);
    expect((await operator.getDeploymentInfo()).backend.component).toBe(
      "backend",
    );
  });
});
