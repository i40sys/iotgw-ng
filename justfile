# iotgw-ng — workspace orchestrator
# One entry point for the whole monorepo. Run `just` to list recipes.
# The platform runs on Kubernetes (kind locally) — `just bootstrap` brings the
# whole stack up on kind. See deploy/README.md and decision-015/017/018.
# The dev stack (iotgw-ui app + backend + backlog) runs via `just dev`
# (tmux + mprocs, attach-or-create — scripts/dev-session.sh).

set shell := ["bash", "-uc"]

# default: list recipes
default:
    @just --list

# ─────────────────────────── secrets (SOPS+age) ───────────────────────────

# The k8s Secrets are created directly from the SOPS store by the kind bootstrap
# (deploy/kind/bootstrap.sh make_secrets) — they do not need a rendered .env.
# Decrypt encrypted secrets to their consuming .env files (pnpm-dev consumers)
secrets-render *args:
    tools/secrets/secrets.sh render {{args}}

# Audit every encrypted secret (round-trip + cleartext-leak check)
secrets-check:
    tools/secrets/secrets.sh check

# Edit one encrypted secret in $EDITOR (re-encrypts on save)
secrets-edit name:
    tools/secrets/secrets.sh edit {{name}}

# ─────────────────────────── iotgw-ui (pnpm) ───────────────────────────

# Run the dev stack (iotgw-ui app + backend + backlog) in tmux+mprocs.
# Attach-or-create: reuses a running stack, never duplicates it, and reclaims
# only THIS repo's orphaned ports (52173/52174/52175). Also: `just dev status`,
# `just dev stop`, `just dev up --force` (kill our orphans without prompting).
dev *args:
    scripts/dev-session.sh {{args}}

# Type-check + lint + test the app
ui-check:
    cd iotgw-ui && pnpm typecheck && pnpm lint && pnpm test

# ─────────────────────────── kubernetes (kind) ───────────────────────────

# Create the local kind cluster (+ ingress-nginx + StackGres operator)
kind-up:
    deploy/kind/bootstrap.sh up

# Delete the local kind cluster
kind-down:
    deploy/kind/bootstrap.sh down

# Deploy the platform into kind (secrets, images, kustomize overlay, app schema)
k8s-deploy:
    deploy/kind/bootstrap.sh deploy

# Render the kustomize dev overlay (no apply) — sanity check
k8s-build:
    kubectl kustomize deploy/k8s/overlays/kind

# Fixes PostgREST/GoTrue CrashLooping on "password authentication failed" (and
# the UI's "An invalid response was received from the upstream server"):
# `authenticator` is co-owned by StackGres/Patroni, which reconciles it on a
# schedule, so a bare ALTER ROLE reverts. `k8s-deploy` already runs this — the
# recipe is for repairing a live cluster without a full redeploy. See
# deploy/README.md § Postgres tier.

# Re-sync the Supabase DB role passwords from the SOPS store onto the primary
db-sync-roles:
    deploy/kind/bootstrap.sh sync-roles

# Smoke-test what is deployed in kind
k8s-smoke:
    deploy/kind/bootstrap.sh smoke

# Cross-stack status — platform workloads across all per-subproject namespaces
# (decision-020: kms/kestra/supabase-db/supabase-app/iotgw-ui), rolled up by the
# shared part-of label.
status:
    @kubectl get pods -A -l app.kubernetes.io/part-of=iotgw-ng 2>/dev/null || echo "kind cluster not running (just kind-up && just k8s-deploy)"

# ─────────────────────────── meta ───────────────────────────

# Repeatable verification: secret hygiene, SOPS round-trip, kustomize render,
# ui typecheck+tests, and kind smoke (if the cluster is up)
verify:
    tools/verify.sh

# End-to-end provisioning cycle against the running kind cluster: backend
# (HTTP -> network+device -> KMS + Netmaker, asserts the WireGuard config and a
# KMS round-trip, then teardown) followed by the browser (Playwright UI ->
# backend, same outcome checks). Asserts the real systems are ready — not a 202.
# Requires the cluster up (run after `just bootstrap`). Chromium is installed
# idempotently on first run.
e2e:
    cd iotgw-ui && pnpm --filter @iotgw/app run test:e2e:install
    cd iotgw-ui && pnpm --filter @iotgw/backend test:e2e
    cd iotgw-ui && pnpm --filter @iotgw/app test:e2e

# Full local bring-up on kind: create the cluster -> deploy -> smoke -> e2e
bootstrap: kind-up k8s-deploy k8s-smoke e2e

# ─────────────────────────── wiki (knowledge base) ───────────────────────────

# Refresh the in-vault copies of backlog/ at wiki/_sources/ (Obsidian shows real
# files, not symlinks). Run after editing backlog/. See wiki/README.md.
wiki-sources:
    tools/wiki-sources-sync.sh
