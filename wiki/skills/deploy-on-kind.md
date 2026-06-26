---
title: Deploy on kind
category: skills
tags: [infra/kind, infra/kubernetes, secrets/sops, status/current]
sources:
  - backlog/decisions/decision-015 - Kubernetes-Migration-with-local-kind.md
  - backlog/decisions/decision-014 - Secrets-Management-with-SOPS-and-age.md
  - backlog/decisions/decision-020 - Namespace-per-subproject-topology.md
relationships:
  - target: "[[concepts/kubernetes-migration-kind]]"
    type: related_to
summary: How to bring up the platform on the local kind cluster — secrets from SOPS, kustomize overlay apply, smoke test — and the known gotchas (node pin, KMS NetworkPolicy, StackGres version).
provenance:
  extracted: 0.8
  inferred: 0.15
  ambiguous: 0.05
base_confidence: 0.6
lifecycle: draft
lifecycle_changed: 2026-06-26
tier: supporting
created: 2026-06-26
updated: 2026-06-26
---

# Deploy on kind

The validated local-deploy path. Operate from the repo root via `just`, or `cd`
into `deploy/` and drive `bootstrap.sh` / `kubectl`.

## Bring-up

```bash
just secrets-render        # render secrets from the SOPS store before any bring-up
just kind-up               # create the kind cluster (name iotgw, node v1.31.12)
just k8s-deploy            # make Secrets from SOPS + apply the kind overlay (+ headlamp)
just k8s-smoke             # smoke-test KMS / Postgres / Kestra / ingress
```

`deploy/kind/bootstrap.sh` exposes `up | secrets | deploy | smoke | down`. Custom
images are built `:local` and `kind load`-ed by default
([[references/container-image-cicd]]).

## How secrets reach the cluster

k8s Secrets are created **straight from the SOPS store** by
`bootstrap.sh make_secrets` (`tools/secrets/secrets.sh k8s <file> <ns> <secret>`),
never inlined ([[concepts/secrets-management-sops-age]]). To roll a secret:
edit it, refresh the Secret, then `kubectl rollout restart` the consumer.
Secrets fan out per namespace ([[concepts/namespace-per-subproject]]).

## Known gotchas

- **Node pinned to `kindest/node:v1.31.12`** — default v1.35's containerd 2.x
  rejects the `cosmian/kms` image ([[entities/kind]]).
- **StackGres operator v1.18.8 is broken on k8s 1.31** — use **v1.17.4**
  ([[entities/stackgres]]).
- **KMS NetworkPolicy** default-denies `:9998`; the host→NodePort `/version`
  smoke is blocked by the enforcing `kindnet` CNI — smoke falls back to an
  in-cluster probe ([[entities/cosmian-kms]]).
- After the namespace split, **cross-namespace calls need FQDNs**; the live
  pg_net webhook URL and Kestra KV URLs are runtime state edited at their source
  and re-synced, not just in `deploy/k8s`.

## Hard rule

> [!warning] Never run flows against real target IPs
> Never execute install/provisioning/connectivity-check flows against
> `192.168.4.0/24` or `10.121.0.0/16` (destructive to real hardware) — use a
> `0.0.0.0` dummy only.

## Sources

- decision-015, decision-014, decision-020.
- Related: [[concepts/kubernetes-migration-kind]], [[skills/iotgw-ui-development-workflow]], [[synthesis/docker-compose-decommission]].

<!-- _sources-links -->

**Original documents** (browsable in-vault under `_sources/`):

- [[_sources/decisions/decision-015 - Kubernetes-Migration-with-local-kind|decision-015 - Kubernetes-Migration-with-local-kind]]
- [[_sources/decisions/decision-014 - Secrets-Management-with-SOPS-and-age|decision-014 - Secrets-Management-with-SOPS-and-age]]
- [[_sources/decisions/decision-020 - Namespace-per-subproject-topology|decision-020 - Namespace-per-subproject-topology]]
