---
id: decision-038
title: "038: Kubernetes version parity between kind (dev) and OVH MKS"
date: '2026-09-30 06:37'
status: proposed
---
## Context

> **Status: proposed — open for discussion.** Replaces the former task draft
> DRAFT-002 ("Recreate kind with Kubernetes 1.35 to match OVH").

The user wants dev (kind) and the real environment (OVH MKS `ymbihq`, task-142)
on the same component versions when they are compatible. After task-142 and the
v0.5.0 rollout:

- **Aligned:** Cosmian KMS 5.27.1, StackGres operator 1.19.1, the custom images,
  and every manifest (same `deploy/k8s/base`).
- **Not aligned:** Kubernetes — kind **1.31.12** (containerd 2.1) vs OVH
  **1.35.2** (containerd 2.2, `updatePolicy: ALWAYS_UPDATE`, so OVH moves on its
  own).

The gap already bit once: Cosmian KMS 5.20.0 ran on kind but failed on OVH
because containerd 2.2 rejects images whose `/etc/passwd` is an absolute
symlink — a runtime difference kind could not reveal.

A kind node-image change requires **recreating the cluster**: kind's local data
is lost (dev only since task-151; backups of the old production copy are in
`~/.local/share/iotgw-migration/2026-09-29/`).

## Decision

**Proposed direction (not accepted):** recreate kind on the `kindest/node`
image closest to OVH's Kubernetes minor (1.35.x), pin it in
`deploy/kind/`, and re-align after each OVH minor upgrade.

### Options considered

| Option | Pros | Cons |
|---|---|---|
| A. Recreate kind at 1.35 now, follow OVH minors (proposed) | Dev reproduces the real runtime (containerd, API removals) | A recreate per OVH minor; kindest/node may lag OVH |
| B. Keep kind at 1.31 until something breaks | No work now | Surprises only show up on OVH (as with KMS 5.20) |
| C. Pin OVH to a fixed minor (`updatePolicy`) | Predictable target | Security updates delayed; fights the managed service |
| D. CI smoke on a disposable cluster matching OVH (kind in CI) | Catches drift without touching the dev cluster | CI time; still not the same containerd build as OVH |

## Open questions

- Does a `kindest/node` image for 1.35 ship containerd 2.2 (the component that
  actually differed)? If not, is option D enough?
- How often does OVH move minors under `ALWAYS_UPDATE`, and should the
  re-alignment be a checklist item of the release runbook?
- Is losing kind's dev data on each recreate acceptable, or should
  `just bootstrap` restore a dev seed (it now seeds only the `dev` domain)?
- Known recreate pitfalls to budget for: extraPortMappings, fresh-cluster
  bring-up races, the kindnet NetworkPolicy wedge.

## Consequences

- If accepted: one task to bump `deploy/kind/cluster.yaml` (+ bootstrap) and
  validate `just bootstrap` / `just e2e`, and a runbook line to re-check parity
  after OVH upgrades.
- Until then kind stays on 1.31.12 and differences are caught on OVH.
