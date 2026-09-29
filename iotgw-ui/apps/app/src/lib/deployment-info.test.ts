import { describe, expect, it } from "vitest";
import {
  buildStatus,
  deploymentDiagnostics,
  imageStatus,
} from "./deployment-info";
import type { ReleaseComponent } from "./deployment-info";
import type { BuildInfo } from "../../../../build-metadata/build-info.mjs";

const build: BuildInfo = {
  component: "frontend",
  version: "0.10.2",
  revision: "a".repeat(40),
  release: "v1.2.3",
  builtAt: "2026-09-29T10:00:00Z",
  dirty: false,
  development: false,
};
const component: ReleaseComponent = {
  id: "frontend",
  name: "Frontend",
  version: build.version,
  revision: build.revision,
  image: `example/frontend@sha256:${"b".repeat(64)}`,
  workload: null,
  observation: null,
};

describe("release declaration vs evidence", () => {
  it("compares the actual browser build rather than trusting a backend release label", () => {
    expect(buildStatus(build, component, "v1.2.3")).toBe("matching");
    for (const actual of [
      { ...build, revision: "c".repeat(40) },
      { ...build, dirty: true },
      { ...build, release: "v1.2.2" },
      { ...build, development: true },
    ]) {
      expect(buildStatus(actual, component, "v1.2.3")).toBe("mismatch");
    }
    expect(buildStatus({ ...build, revision: null }, component, "v1.2.3")).toBe(
      "unverified",
    );
    expect(buildStatus(build, undefined, undefined)).toBe("unverified");
  });
  it("does not treat mutable tags or missing snapshots as proof of deployed image content", () => {
    expect(imageStatus(component)).toBe("unverified");
    const observation = {
      checkedAt: build.builtAt,
      ready: true,
      images: [component.image!],
      imageIds: [],
    };
    expect(imageStatus({ ...component, observation })).toBe("matching");
    expect(
      imageStatus({
        ...component,
        image: "example/frontend:latest",
        observation: { ...observation, images: ["example/frontend:latest"] },
      }),
    ).toBe("unverified");
    expect(
      imageStatus({
        ...component,
        observation: { ...observation, ready: false },
      }),
    ).toBe("mismatch");
    expect(
      imageStatus({
        ...component,
        observation: { ...observation, images: ["old-image"] },
      }),
    ).toBe("mismatch");
  });
  it("preserves a failed image snapshot even when the reported source revision matches", () => {
    const result = deploymentDiagnostics(build, {
      backend: { ...build, component: "backend" },
      metadataStatus: "available",
      manifest: {
        schemaVersion: 1,
        product: "Edge Manager",
        environment: "production",
        release: "v1.2.3",
        createdAt: build.builtAt,
        components: [
          {
            ...component,
            observation: {
              checkedAt: build.builtAt,
              ready: false,
              images: [component.image!],
              imageIds: [],
            },
          },
        ],
      },
    });
    expect(result.components[0].status).toBe("mismatch");
  });
});
