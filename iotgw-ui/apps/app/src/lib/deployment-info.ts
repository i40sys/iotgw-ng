import type { BuildInfo } from "../../../../build-metadata/build-info.mjs";
import type {
  DeploymentInfo,
  ReleaseManifest,
} from "../../../backend/src/services/deployment-info";

export type ComponentStatus = "matching" | "mismatch" | "unverified";
export type ReleaseComponent = ReleaseManifest["components"][number];

export function buildStatus(
  build: BuildInfo,
  expected: ReleaseComponent | undefined,
  release: string | undefined,
): ComponentStatus {
  if (!expected) return "unverified";
  if (
    build.dirty ||
    build.development ||
    (expected.revision &&
      build.revision &&
      expected.revision !== build.revision) ||
    (expected.version && expected.version !== build.version) ||
    (release && build.release && release !== build.release)
  )
    return "mismatch";
  return expected.revision &&
    build.revision === expected.revision &&
    build.dirty === false
    ? "matching"
    : "unverified";
}

export function imageStatus(component: ReleaseComponent): ComponentStatus {
  const observed = component.observation;
  if (!component.image || !observed) return "unverified";
  if (
    !observed.ready ||
    observed.images.some((image) => image !== component.image)
  )
    return "mismatch";
  // A matching mutable tag is not evidence of identical image contents.
  return observed.images.length > 0 &&
    /@sha256:[a-f0-9]{64}$/.test(component.image)
    ? "matching"
    : "unverified";
}

export function deploymentDiagnostics(
  frontend: BuildInfo,
  info?: DeploymentInfo,
) {
  const manifest = info?.manifest;
  const builds = [frontend, ...(info ? [info.backend] : [])];
  return {
    product: "Edge Manager",
    release: manifest?.release ?? null,
    environment: frontend.development
      ? "development"
      : (manifest?.environment ?? null),
    metadataStatus: info?.metadataStatus ?? "unavailable",
    frontend,
    backend: info?.backend ?? null,
    manifest: manifest ?? null,
    components: (manifest?.components ?? []).map((component) => {
      const build = builds.find((value) => value.component === component.id);
      const image = imageStatus(component);
      const source = build
        ? buildStatus(build, component, manifest?.release)
        : "unverified";
      const status: ComponentStatus =
        source === "mismatch" || image === "mismatch"
          ? "mismatch"
          : build
            ? source
            : image;
      return {
        id: component.id,
        status,
        evidence: build ? "running-build" : "image-snapshot",
      };
    }),
  };
}
