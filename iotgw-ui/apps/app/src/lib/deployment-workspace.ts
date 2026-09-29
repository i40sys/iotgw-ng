import type { Database, Json } from "@iotgw/supabase-contract";
import { z } from "zod";
import { deploymentConfigSchema } from "@/schemas/deployment-config";
import { parseConfig, withStepDefaults } from "@/lib/deployment-config-form";

export type DeploymentVersion =
  Database["public"]["Tables"]["deployments"]["Row"];
export interface DeploymentDevice {
  id: string;
  name: string;
  ip_address: string | null;
  network_id: string | null;
  ssh_key_id: string | null;
}
export interface DeploymentNetwork {
  id: string;
  name: string;
  domain_id: string;
}
export interface DeploymentDomain {
  id: string;
  name: string;
  display_name: string | null;
}

export interface DeploymentDraft {
  name: string;
  description: string;
  configurationJson: string;
}

export function newDeploymentDraft(): DeploymentDraft {
  return {
    name: "",
    description: "",
    configurationJson: JSON.stringify(
      withStepDefaults(withStepDefaults({}, "os-installation"), "provisioning"),
      null,
      2,
    ),
  };
}

export function draftFromVersion(version: DeploymentVersion): DeploymentDraft {
  return {
    name: version.name,
    description: version.description ?? "",
    configurationJson:
      typeof version.configuration === "string"
        ? version.configuration
        : JSON.stringify(version.configuration, null, 2),
  };
}

export function draftsEqual(a: DeploymentDraft, b: DeploymentDraft): boolean {
  if (a.name !== b.name || a.description !== b.description) return false;
  const left = parseConfig(a.configurationJson);
  const right = parseConfig(b.configurationJson);
  // Ignore whitespace-only edits without treating invalid JSON as saved.
  return left && right
    ? JSON.stringify(left) === JSON.stringify(right)
    : a.configurationJson === b.configurationJson;
}

export function sortVersions(
  versions: DeploymentVersion[],
): DeploymentVersion[] {
  return [...versions].sort(
    (a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true }) ||
      (b.modified_at ?? "").localeCompare(a.modified_at ?? ""),
  );
}

export function nextVersionNumber(versions: DeploymentVersion[]): string {
  return String(
    Math.max(0, ...versions.map((v) => Number.parseInt(v.version, 10) || 0)) +
      1,
  );
}

export function prepareConfiguration(
  draft: DeploymentDraft,
  version: string,
): Json {
  const config = parseConfig(draft.configurationJson);
  if (!config || !draft.name.trim())
    throw new Error("Invalid deployment configuration");
  const result = { ...config, name: draft.name.trim(), version };
  deploymentConfigSchema.parse(result);
  // parseConfig only accepts objects read from JSON; metadata is also JSON-safe.
  return result as Json;
}

const draftSchema = z.object({
  name: z.string(),
  description: z.string(),
  configurationJson: z.string(),
});
const cachedDraftSchema = z.object({
  deviceId: z.string(),
  versionId: z.string().nullable(),
  draft: draftSchema,
});
type CachedDraft = z.infer<typeof cachedDraftSchema>;
const draftKey = (deviceId: string) => `iotgw-deployment-draft-v2:${deviceId}`;

function legacyDraft(deviceId: string): CachedDraft | null {
  try {
    const parsed = z
      .object({
        selectedDeviceId: z.string(),
        selectedVersion: z.object({ id: z.string(), device_id: z.string() }),
        formName: z.string(),
        formDescription: z.string(),
        configurationJson: z.string().min(1),
      })
      .safeParse(
        JSON.parse(localStorage.getItem("iotgw-deployment-settings") ?? "null"),
      );
    if (
      !parsed.success ||
      parsed.data.selectedDeviceId !== deviceId ||
      parsed.data.selectedVersion.device_id !== deviceId
    )
      return null;
    const saved = parsed.data;
    return {
      deviceId,
      versionId:
        saved.selectedVersion.id === "default"
          ? null
          : saved.selectedVersion.id,
      draft: {
        name: saved.formName,
        description: saved.formDescription,
        configurationJson: saved.configurationJson,
      },
    };
  } catch {
    return null;
  }
}

export function readDraft(deviceId: string): CachedDraft | null {
  try {
    const cached = sessionStorage.getItem(draftKey(deviceId));
    if (!cached) return legacyDraft(deviceId);
    const parsed = cachedDraftSchema.safeParse(JSON.parse(cached));
    return parsed.success && parsed.data.deviceId === deviceId
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

export function cacheDraft(
  deviceId: string,
  versionId: string | null,
  draft: DeploymentDraft,
) {
  try {
    sessionStorage.setItem(
      draftKey(deviceId),
      JSON.stringify({ deviceId, versionId, draft }),
    );
    // Only retire a legacy draft once a matching device's copy is safely stored.
    if (legacyDraft(deviceId))
      localStorage.removeItem("iotgw-deployment-settings");
  } catch {
    /* Storage may be unavailable; the navigation guard still protects edits. */
  }
}

export function forgetDraft(deviceId: string) {
  try {
    sessionStorage.removeItem(draftKey(deviceId));
  } catch {
    /* Optional storage. */
  }
}
