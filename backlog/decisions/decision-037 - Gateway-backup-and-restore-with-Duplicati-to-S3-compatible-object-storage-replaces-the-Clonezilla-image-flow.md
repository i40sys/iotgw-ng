---
id: decision-037
title: >-
  037: Gateway backup and restore with Duplicati to S3-compatible object storage
  (replaces the Clonezilla image flow)
date: '2026-09-30 06:37'
status: proposed
---
## Context

> **Status: proposed — open for discussion.** This decision only frames the
> idea; nothing is implemented. It replaces the former task draft DRAFT-001
> ("Clonezilla backup/restore resources on the OVH netboot").

Two backup mechanisms exist today:

- **Clonezilla disk images (old netboot, y0).** The iPXE `backup` / `restore`
  entries booted Clonezilla with `ocs_preload` of `boot.tgz` and a per-machine
  `<maquina_id>.tgz` (m0, m5, esade10, …) that ran `/etc/rc.local` against an
  image repository. None of this was migrated: on the OVH netboot
  (task-149.02) those entries keep their menu items but the resource wiring is
  commented out, so they **fail on purpose**. The content of `boot.tgz` and the
  per-machine archives (scripts, repository location, credentials) was never
  inventoried.
- **Duplicati on the gateways (already deployed).** Provisioning installs a
  Duplicati Docker stack (iotgw-kestra `files/stacks/duplicati`,
  `tasks/duplicati.yaml`) with two imported jobs, **Docker** and **System**,
  whose destinations are per-deployment variables
  (`duplicati_docker_target_url`, `duplicati_system_target_url`, required by
  `tasks/preflight.yaml`). The job templates carry `--no-encryption`; the web UI
  is reachable only from `ManagementIPs` (port 8200, `firewall.j2`).

The plan is to make **Duplicati to S3-compatible object storage** the gateway
backup/restore path and to stop depending on whole-disk images.

## Decision

**Proposed direction (not accepted):**

1. Gateways back up with the existing Duplicati stack to an **S3-compatible
   bucket**; the provider is interchangeable because Duplicati speaks S3:
   - **OVH Object Storage** (same project as the MKS cluster; S3 users and
     per-user policies are already used for the Terraform state, task-143);
   - **Backblaze B2** (S3-compatible API), or another S3 provider (Wasabi,
     Scaleway, Cloudflare R2, …).
2. **Restore** = reinstall the gateway (install + provisioning flows, or the
   live image) and restore the Duplicati backup — instead of restoring a disk
   image.
3. The Clonezilla `backup` / `restore` menu entries are **retired** once the
   Duplicati path is proven; `clonezilla-debian` may stay as a manual tool.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| A. Duplicati → S3 (proposed) | Already on every gateway; incremental, deduplicated; provider-agnostic; restore is file-level | Not a bare-metal image; restore needs a reinstall first |
| B. Keep Clonezilla images, migrate `boot.tgz`/`<id>.tgz` to OVH | Bit-exact whole-disk restore | Unknown content + credentials to inventory; large images; LAN-bound repository; hand-made scripts |
| C. Both (Duplicati daily, Clonezilla on demand) | Covers file and bare-metal restore | Two systems to maintain |

## Open questions

- **Provider:** OVH (same bill/region as MKS) vs Backblaze B2 (cheap egress
  to Cloudflare, cost per TB) vs others — criteria: price per TB, egress,
  region/GDPR, object lock / immutability support.
- **Bucket layout and credentials:** one bucket per domain or per gateway?
  One S3 user per gateway (least privilege, easy revocation) vs a shared user?
  Where do the credentials live (SOPS → Kestra KV → provisioning vars) and how
  are they rotated?
- **Encryption:** the job templates set `--no-encryption`. Client-side
  encryption with a per-domain passphrase (who holds it? KMS?) vs relying on
  provider SSE only.
- **Scope:** what exactly is backed up (Docker volumes, `/etc/config`,
  agent state) and what must never be (keys that are re-issued on enrolment:
  WireGuard, SSH host keys, one-time-code seeds)?
- **Retention and immutability:** retention policy per job; object lock /
  versioning against ransomware or a compromised gateway deleting its backups.
- **Restore drill:** the acceptance test for "a gateway is recoverable" and
  how often it runs (QEMU harness from decision-029?).
- **Monitoring:** Duplicati already posts results (`--send-http-url`): where
  to, and who is alerted on failure?
- **Non-gateway machines** (m0, m5, esade10 …) that used the Clonezilla flow:
  in scope here, or a separate decision?

## Consequences

- If accepted: new tasks for bucket/credential provisioning (Terraform), the
  Duplicati job templates (target URL, encryption), a restore runbook + drill,
  and removing the Clonezilla backup/restore entries from the OVH menu.
- Until then the OVH menu keeps the Clonezilla entries failing on purpose, as
  agreed for task-149.
