import { logger } from "../logger";

/**
 * pki-manager ADMIN client for iotgw-ng zone provisioning (decision-026 phase 0,
 * task-080). Distinct from the edge function's `_shared/pki-manager.ts`, which
 * only holds a zone-scoped FLEET token and can sign host certs. This client
 * holds an OIDC bearer with pki-manager admin rights (decision-028 §9: global
 * admin over pki.joor.net accepted as a documented interim) and creates the
 * per-domain zone, its user + host CAs, and its principals.
 *
 * iotgw-ng implements NO PKI — this only calls pki-manager's REST API. No key
 * material ever crosses back into the backend: CAs are generated inside
 * pki-manager's own Cosmian KMS; we persist only the zone name and the CA ids.
 *
 * Env-driven (decision-014); the credential is SOPS-stored (task-074 AC#4):
 *   PKI_BASE_URL              e.g. https://pki.joor.net       (API base = <url>/api/v1)
 *   PKI_OIDC_TOKEN_URL        the realm token endpoint
 *   PKI_OIDC_CLIENT_ID        the OIDC client id
 *   one grant, in this order of preference:
 *     PKI_OIDC_CLIENT_SECRET  → client_credentials (a dedicated service account)
 *     PKI_OIDC_USERNAME + PKI_OIDC_PASSWORD → password/ROPC (interim operator cred)
 */

const PKI_BASE_URL = (process.env.PKI_BASE_URL ?? "").replace(/\/+$/, "");
const PKI_OIDC_TOKEN_URL = process.env.PKI_OIDC_TOKEN_URL ?? "";
const PKI_OIDC_CLIENT_ID = process.env.PKI_OIDC_CLIENT_ID ?? "";
const PKI_OIDC_CLIENT_SECRET = process.env.PKI_OIDC_CLIENT_SECRET;
const PKI_OIDC_USERNAME = process.env.PKI_OIDC_USERNAME;
const PKI_OIDC_PASSWORD = process.env.PKI_OIDC_PASSWORD;

/** The two principals every iotgw-ng zone gets (decision-024 §5). */
export const IOTGW_PRINCIPALS = ["iotgw-admin", "iotgw-ops"] as const;

/**
 * User-certificate TTLs, in seconds, DECIDED in decision-028 §1 (task-070).
 * Single source of truth for both issuers so the value is applied in code, not
 * only written down:
 *   - `iotgw-admin` (human operators) — 24 h + a documented offline renewal path;
 *     field/on-site sessions are common, so 12 h would strand operators. A
 *     departed admin keeps access ≤24 h; the KRL is the emergency revocation path.
 *     Applied by scripts/ssh-ca/user-cert.sh (VALID_FOR_SECONDS default 86400).
 *   - `iotgw-ops` (the Kestra runner) — 2 h, minted by the BACKEND (never the
 *     runner pod, so no issuance credential lands in a pod). Consumed by the
 *     backend user-cert issuance the Kestra runner will call (task-092).
 */
export const IOTGW_USER_CERT_TTL_SECONDS = {
  "iotgw-admin": 86_400,
  "iotgw-ops": 7_200,
} as const satisfies Record<(typeof IOTGW_PRINCIPALS)[number], number>;

export class PkiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PkiError";
    this.status = status;
  }
}

/** True when enough env is present to attempt provisioning at all. */
export function isPkiConfigured(): boolean {
  const hasCredential =
    Boolean(PKI_OIDC_CLIENT_SECRET) ||
    (Boolean(PKI_OIDC_USERNAME) && Boolean(PKI_OIDC_PASSWORD));
  return Boolean(
    PKI_BASE_URL && PKI_OIDC_TOKEN_URL && PKI_OIDC_CLIENT_ID && hasCredential,
  );
}

function assertConfigured(): void {
  if (!isPkiConfigured()) {
    throw new PkiError(
      "pki-manager is not configured: set PKI_BASE_URL, PKI_OIDC_TOKEN_URL, " +
        "PKI_OIDC_CLIENT_ID and either PKI_OIDC_CLIENT_SECRET or " +
        "PKI_OIDC_USERNAME/PKI_OIDC_PASSWORD (secrets/, SOPS+age).",
    );
  }
}

// ── OIDC token (cached until ~30 s before expiry) ──────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value;
  }

  const form = new URLSearchParams();
  form.set("client_id", PKI_OIDC_CLIENT_ID);
  if (PKI_OIDC_CLIENT_SECRET) {
    // Preferred: a dedicated confidential client (blast radius = its roles).
    form.set("grant_type", "client_credentials");
    form.set("client_secret", PKI_OIDC_CLIENT_SECRET);
  } else {
    // Interim: resource-owner password grant with the operator credential
    // (decision-028 §9). Swappable for the above with no code change.
    form.set("grant_type", "password");
    form.set("username", PKI_OIDC_USERNAME!);
    form.set("password", PKI_OIDC_PASSWORD!);
  }

  const response = await fetch(PKI_OIDC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new PkiError(
      `OIDC token request failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
      response.status,
    );
  }
  const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    throw new PkiError("OIDC token response contained no access_token");
  }
  cachedToken = {
    value: body.access_token,
    expiresAt: now + (body.expires_in ?? 300) * 1000,
  };
  return cachedToken.value;
}

// ── REST helper ────────────────────────────────────────────────────────────

async function pkiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: T | null }> {
  const token = await getToken();
  const response = await fetch(`${PKI_BASE_URL}/api/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await response.text();
  // A 404 is a legitimate "not found" for our idempotence probes — surface the
  // status so callers can branch on it rather than throwing.
  if (!response.ok && response.status !== 404) {
    throw new PkiError(
      `pki-manager ${init.method ?? "GET"} ${path} failed (HTTP ${response.status}): ${text.slice(0, 300)}`,
      response.status,
    );
  }
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new PkiError(`pki-manager ${path} returned non-JSON: ${text.slice(0, 200)}`);
    }
  }
  return { status: response.status, data };
}

// ── domain types (only the fields we depend on) ────────────────────────────

interface Zone {
  id: string;
  name: string;
  status?: string;
}
interface Ca {
  id: string;
  zoneId: string;
  caType: "user" | "host";
  status?: string;
}
interface Principal {
  id: string;
  name: string;
  zoneId?: string;
}

// ── idempotent building blocks ─────────────────────────────────────────────

/** Resolve a zone by name/ref; null when it does not exist. */
async function getZone(ref: string): Promise<Zone | null> {
  const { status, data } = await pkiFetch<Zone>(
    `/ssh/zones/${encodeURIComponent(ref)}`,
  );
  if (status === 404 || !data) return null;
  return data;
}

async function ensureZone(
  name: string,
  displayName: string,
  description: string,
): Promise<Zone> {
  const existing = await getZone(name);
  if (existing) return existing;
  const { data } = await pkiFetch<Zone>("/ssh/zones", {
    method: "POST",
    body: { name, displayName, description },
  });
  if (!data?.id) throw new PkiError(`zone create for '${name}' returned no id`);
  return data;
}

/** Active CA of a type in a zone, or null. */
async function findCa(
  zoneId: string,
  caType: "user" | "host",
): Promise<Ca | null> {
  const { data } = await pkiFetch<Ca[]>("/ssh/cas");
  const list = data ?? [];
  const match = list.filter(
    (c) => c.zoneId === zoneId && c.caType === caType && c.status !== "retired",
  );
  // Prefer an explicitly-active CA; fall back to any non-retired match.
  return match.find((c) => c.status === "active") ?? match[0] ?? null;
}

async function ensureCa(
  zoneName: string,
  zoneId: string,
  caType: "user" | "host",
  label: string,
): Promise<string> {
  const existing = await findCa(zoneId, caType);
  if (existing) return existing.id;
  const { data } = await pkiFetch<Ca>("/ssh/cas", {
    method: "POST",
    body: { caType, zone: zoneName, label },
  });
  if (!data?.id) {
    throw new PkiError(`${caType} CA create in zone '${zoneName}' returned no id`);
  }
  return data.id;
}

async function ensurePrincipal(
  zoneName: string,
  zoneId: string,
  name: string,
): Promise<void> {
  const { data } = await pkiFetch<Principal[]>("/ssh/principals");
  const exists = (data ?? []).some(
    (p) => p.name === name && (p.zoneId === undefined || p.zoneId === zoneId),
  );
  if (exists) return;
  await pkiFetch<Principal>("/ssh/principals", {
    method: "POST",
    body: { name, zone: zoneName, description: `iotgw-ng ${name} (decision-024 §5)` },
  });
}

// ── orchestrator ───────────────────────────────────────────────────────────

export interface DomainZoneLink {
  pki_zone: string;
  pki_user_ca_id: string;
  pki_host_ca_id: string;
}

/**
 * Ensure the pki-manager zone + CAs + principals for a domain exist, and return
 * the references to persist on the `domains` row. Idempotent and RESUMABLE: each
 * step detects what already exists and only creates the missing piece, so a
 * re-run after a partial failure completes it rather than duplicating
 * (task-080 AC#2). Every call passes the zone explicitly so pki-manager's
 * fail-closed resolution never picks a zone for us (AC#5).
 *
 * @param domainSlug  the domain's `name` (used to derive the zone name)
 * @param displayName the domain's display name (zone displayName)
 * @param existingZone the domain's current `pki_zone` if already linked (e.g.
 *        the hand-linked `iotgw-lab`); when set it is used verbatim instead of
 *        deriving `iotgw-<slug>`, so a hand-linked domain is not given a 2nd zone.
 */
export async function ensureDomainPkiZone(params: {
  domainSlug: string;
  displayName: string;
  existingZone?: string | null;
}): Promise<DomainZoneLink> {
  assertConfigured();
  const trimmedExisting = params.existingZone?.trim();
  const zoneName =
    trimmedExisting && trimmedExisting.length > 0
      ? trimmedExisting
      : `iotgw-${params.domainSlug}`;

  const zone = await ensureZone(
    zoneName,
    params.displayName.trim() ? params.displayName : zoneName,
    `iotgw-ng SSH CA zone for domain '${params.domainSlug}' (one zone per domain, decision-024/026).`,
  );

  const userCaId = await ensureCa(zone.name, zone.id, "user", `${zoneName}-users`);
  const hostCaId = await ensureCa(zone.name, zone.id, "host", `${zoneName}-hosts`);

  for (const principal of IOTGW_PRINCIPALS) {
    await ensurePrincipal(zone.name, zone.id, principal);
  }

  logger.info(
    { zone: zone.name, userCaId, hostCaId },
    `pki-manager zone provisioned for domain '${params.domainSlug}'`,
  );
  return { pki_zone: zone.name, pki_user_ca_id: userCaId, pki_host_ca_id: hostCaId };
}

/** Offboard a pki-manager host (terminal; task-081/102). */
export async function offboardHost(hostId: string): Promise<void> {
  assertConfigured();
  await pkiFetch(`/ssh/hosts/${encodeURIComponent(hostId)}/offboard`, {
    method: "POST",
  });
}

export interface PkiHost {
  id: string;
  fqdn: string;
  zoneId: string;
  status?: string;
}

/**
 * List the pki-manager SSH hosts that are still ACTIVE (not offboarded). Used by
 * the orphan check (task-102 §2): a host that is active but has no `devices` row
 * pointing at it is a device that was deleted WITHOUT being offboarded — the
 * exact gap the mandatory offboard-on-delete must not leave, given Netmaker
 * recycles a deleted device's IP (which is a host-cert principal).
 */
export async function listActiveHosts(): Promise<PkiHost[]> {
  assertConfigured();
  const { data } = await pkiFetch<PkiHost[] | { items?: PkiHost[] }>("/ssh/hosts");
  const list = Array.isArray(data) ? data : (data?.items ?? []);
  return list.filter((h) => h.status !== "offboarded" && h.status !== "retired");
}
