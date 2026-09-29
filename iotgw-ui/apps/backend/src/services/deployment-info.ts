import { readFile } from "node:fs/promises";
import { z } from "zod";
import { getBuildInfo } from "../../../../build-metadata/build-info.mjs";
import type { BuildInfo } from "../../../../build-metadata/build-info.mjs";

declare const __BACKEND_BUILD_INFO__: BuildInfo;

// Bundles carry immutable provenance; only the dev server reads the checkout.
const backendBuild =
  typeof __BACKEND_BUILD_INFO__ === "undefined"
    ? getBuildInfo("backend", {
        development: process.env.NODE_ENV !== "production",
      })
    : __BACKEND_BUILD_INFO__;

const text = z.string().min(1).max(512);
const revision = z.string().regex(/^[a-f0-9]{40,64}$/);

export interface ReleaseComponent {
  id: string;
  name: string;
  version: string | null;
  revision: string | null;
  image: string | null;
  workload: {
    kind: "Deployment" | "StatefulSet";
    namespace: string;
    name: string;
    container: string;
  } | null;
  observation: {
    checkedAt: string;
    images: string[];
    imageIds: string[];
    ready: boolean;
  } | null;
}

export interface ReleaseManifest {
  schemaVersion: 1;
  product: "Edge Manager";
  release: string;
  environment: "development" | "test" | "staging" | "production";
  createdAt: string;
  components: ReleaseComponent[];
}

// Named DTOs keep tRPC's client serialization types independent of Zod internals.
const componentSchema: z.ZodType<ReleaseComponent> = z.object({
  id: text,
  name: text,
  version: text.nullable(),
  revision: revision.nullable(),
  image: text.nullable(),
  workload: z
    .object({
      kind: z.enum(["Deployment", "StatefulSet"]),
      namespace: text,
      name: text,
      container: text,
    })
    .nullable(),
  observation: z
    .object({
      checkedAt: z.string().datetime(),
      images: z.array(text).max(100),
      imageIds: z.array(text).max(100),
      ready: z.boolean(),
    })
    .nullable(),
});

// Zod strips all unrecognized fields, including accidental secrets in the file.
export const releaseManifestSchema: z.ZodType<ReleaseManifest> = z
  .object({
    schemaVersion: z.literal(1),
    product: z.literal("Edge Manager"),
    release: z
      .string()
      .regex(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/),
    environment: z.enum(["development", "test", "staging", "production"]),
    createdAt: z.string().datetime(),
    components: z.array(componentSchema).min(2).max(100),
  })
  .refine(({ components }) => {
    const ids = components.map((component) => component.id);
    return (
      new Set(ids).size === ids.length &&
      ids.includes("frontend") &&
      ids.includes("backend")
    );
  });

export interface DeploymentInfo {
  backend: BuildInfo;
  manifest: ReleaseManifest | null;
  metadataStatus: "available" | "missing" | "invalid";
}

/** Reads only a dedicated, non-secret manifest. No environment dump or cluster credentials. */
export async function getDeploymentInfo(
  path = process.env.IOTGW_RELEASE_MANIFEST_PATH,
): Promise<DeploymentInfo> {
  const result: DeploymentInfo = {
    backend: backendBuild,
    manifest: null,
    metadataStatus: "missing",
  };
  if (!path) return result;
  try {
    const content = await readFile(path, "utf8");
    if (Buffer.byteLength(content) > 256 * 1024)
      return { ...result, metadataStatus: "invalid" };
    const value: unknown = JSON.parse(content);
    if (value === null) return result;
    const parsed = releaseManifestSchema.safeParse(value);
    return parsed.success
      ? { ...result, manifest: parsed.data, metadataStatus: "available" }
      : { ...result, metadataStatus: "invalid" };
  } catch (error) {
    return {
      ...result,
      metadataStatus:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "missing"
          : "invalid",
    };
  }
}
