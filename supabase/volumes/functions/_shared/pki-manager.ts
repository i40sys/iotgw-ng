// Minimal client for the pki-manager SSH Certificate API (decision-024).
//
// iotgw-ng implements NO PKI. This module only *calls* pki-manager:
//   - signs a gateway's host public key with that domain's Host CA;
//   - reads the zone's public trust anchors.
// It cannot create CAs, issue user certificates, or offboard hosts — the fleet
// token it carries is scoped to one zone's Host CA with the op-set
// `sign-host, register-host-pubkey, get-principals` (decision-028 §9).
//
// The fleet token is read from the `supabase-env` Secret and is NEVER placed in
// a response. A device learns its certificate and the public anchors; nothing
// else.

export interface PkiConfig {
  baseUrl: string;
  /** zone slug -> fleet token (`pkimg_…`). */
  fleetTokens: Record<string, string>;
}

export class PkiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "PkiError";
    this.status = status;
  }
}

/**
 * Read the PKI configuration from the environment.
 *
 * `PKI_FLEET_TOKENS` is a JSON object so a single Secret key can carry one
 * token per zone — the fleet grows one zone per iotgw-ng domain, and we do not
 * want a new env var (and a new Deployment roll) for each of them.
 */
export function pkiConfigFromEnv(
  env: { get(key: string): string | undefined } | undefined,
): PkiConfig {
  const baseUrl = (env?.get("PKI_BASE_URL") ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new PkiError("PKI_BASE_URL is not configured");

  const raw = env?.get("PKI_FLEET_TOKENS") ?? "";
  let fleetTokens: Record<string, string>;
  try {
    fleetTokens = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    throw new PkiError("PKI_FLEET_TOKENS is not valid JSON");
  }
  return { baseUrl, fleetTokens };
}

function tokenForZone(cfg: PkiConfig, zone: string): string {
  const token = cfg.fleetTokens[zone];
  if (!token) {
    // Fail closed. Signing with some *other* zone's token would mint a
    // certificate in the wrong trust domain — the one thing zones exist to
    // prevent (decision-024 §2).
    throw new PkiError(`No fleet token configured for pki-manager zone '${zone}'`);
  }
  return token;
}

export interface SignHostResult {
  hostId: string;
  certOpenssh: string;
  serial: string;
  keyId: string;
  validBefore: string;
}

/**
 * Sign a gateway's host public key with its zone's Host CA.
 *
 * `Idempotency-Key` is `<deviceId>-<sha256 of the pubkey>` so a retried
 * enrollment (a dropped response, a re-run of the Ansible task) returns the
 * existing certificate instead of burning a serial on every attempt.
 */
export async function signHost(
  cfg: PkiConfig,
  zone: string,
  params: {
    fqdn: string;
    addresses: string[];
    opensshHostPubkey: string;
    idempotencyKey: string;
    validForSeconds?: number;
  },
): Promise<SignHostResult> {
  const response = await fetch(`${cfg.baseUrl}/api/v1/external/ssh/sign-host`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenForZone(cfg, zone)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      fqdn: params.fqdn,
      addresses: params.addresses,
      opensshHostPubkey: params.opensshHostPubkey,
      ...(params.validForSeconds ? { validForSeconds: params.validForSeconds } : {}),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new PkiError(
      `pki-manager sign-host failed (HTTP ${response.status}): ${text.slice(0, 400)}`,
      response.status,
    );
  }
  return JSON.parse(text) as SignHostResult;
}

/**
 * Fetch one CA's OpenSSH public key.
 *
 * Why *this* route and not the zone-scoped trust endpoints: on the pki.joor.net
 * deployment `/ssh/zones/:zone/{trusted-user-ca-keys,host-ca-keys}` are
 * SPA-shadowed and return the frontend's index.html, while the unscoped
 * `/ssh/trusted-user-ca-keys` serves the **default** zone only — neither is
 * usable for a per-domain zone (verified 2026-09-14; decision-025 §E, and the
 * "un-shadow the zone-scoped public SSH trust routes" task). `/ssh/cas/:id/ca.pub`
 * is public, id-addressed and therefore inherently zone-correct: the ids come
 * from `domains.pki_user_ca_id` / `pki_host_ca_id`, which the backend persisted
 * when it created the zone.
 *
 * It is also read with **no credential**, which is right — a CA public key is
 * public by design, and it keeps the fleet token confined to signing.
 */
export async function caPublicKey(cfg: PkiConfig, caId: string): Promise<string> {
  const response = await fetch(
    `${cfg.baseUrl}/ssh/cas/${encodeURIComponent(caId)}/ca.pub`,
    { headers: { Accept: "text/plain" } },
  );
  const text = (await response.text()).trim();
  if (!response.ok) {
    throw new PkiError(
      `pki-manager ca.pub failed for ${caId} (HTTP ${response.status})`,
      response.status,
    );
  }
  // A SPA fallback serving index.html is the expected shape of a routing
  // regression here; say so rather than shipping HTML to a gateway.
  if (!/^(ssh|ecdsa)-[a-z0-9@.-]+ [A-Za-z0-9+/=]+/.test(text)) {
    throw new PkiError(
      `pki-manager returned a non-key body for CA ${caId} (is the route SPA-shadowed?)`,
    );
  }
  return text;
}

/** The authoritative sshd drop-in for a host, rendered by pki-manager. */
export async function hostSshdConfig(
  cfg: PkiConfig,
  hostId: string,
): Promise<string> {
  const response = await fetch(
    `${cfg.baseUrl}/ssh/hosts/${encodeURIComponent(hostId)}/sshd-config`,
    { headers: { Accept: "text/plain" } },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new PkiError(
      `pki-manager sshd-config failed for host ${hostId} (HTTP ${response.status})`,
      response.status,
    );
  }
  if (!text.includes("TrustedUserCAKeys")) {
    throw new PkiError(
      `pki-manager returned an unexpected sshd-config body for host ${hostId}`,
    );
  }
  return text;
}
