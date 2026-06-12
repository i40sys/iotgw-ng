# iotgw-ng — workspace orchestrator
# One entry point for the whole monorepo. Run `just` to list recipes.
# Stacks stay in their own directories (compose-relative bind mounts); this
# file unifies the cross-stack operations. See README.md and decision-013.

set shell := ["bash", "-uc"]

# Stacks that are docker-compose based (dir name == compose project)
compose_stacks := "supabase kestra kms traefik-poc"

# default: list recipes
default:
    @just --list

# ─────────────────────────── secrets (SOPS+age) ───────────────────────────

# Decrypt all encrypted secrets to their consuming .env files
secrets-render *args:
    tools/secrets/secrets.sh render {{args}}

# Audit every encrypted secret (round-trip + cleartext-leak check)
secrets-check:
    tools/secrets/secrets.sh check

# Edit one encrypted secret in $EDITOR (re-encrypts on save)
secrets-edit name:
    tools/secrets/secrets.sh edit {{name}}

# ─────────────────────────── docker-compose stacks ───────────────────────────

# Bring up one stack (must render its secrets first)
up stack:
    cd {{stack}} && docker compose up -d

# Tear down one stack
down stack:
    cd {{stack}} && docker compose down

# Bring up every compose stack in dependency order
up-all: secrets-render
    cd supabase    && docker compose up -d
    cd kestra      && docker compose up -d
    cd kms         && docker compose up -d
    @echo "traefik-poc is a PoC — start manually with: just up traefik-poc"

# Tear down every compose stack
down-all:
    -cd traefik-poc && docker compose down
    -cd kms         && docker compose down
    -cd kestra      && docker compose down
    -cd supabase    && docker compose down

# Cross-stack status (only iotgw-ng containers)
status:
    @docker ps --format 'table {{{{.Names}}}}\t{{{{.Image}}}}\t{{{{.Status}}}}' \
      | grep -E 'supabase|kestra|cosmian-kms|traefik-poc|whoami' || echo "no iotgw-ng containers running"

# ─────────────────────────── iotgw-ui (pnpm) ───────────────────────────

# Run the app (frontend + backend) in dev
dev:
    cd iotgw-ui && pnpm dev

# Type-check + lint + test the app
ui-check:
    cd iotgw-ui && pnpm typecheck && pnpm lint && pnpm test

# ─────────────────────────── kubernetes (kind) ───────────────────────────

# Create the local kind cluster
kind-up:
    deploy/kind/bootstrap.sh up

# Delete the local kind cluster
kind-down:
    deploy/kind/bootstrap.sh down

# Deploy the dev overlay into kind
k8s-deploy:
    deploy/kind/bootstrap.sh deploy

# Render the kustomize dev overlay (no apply) — sanity check
k8s-build:
    kubectl kustomize deploy/k8s/overlays/kind

# Smoke-test what is deployed in kind
k8s-smoke:
    deploy/kind/bootstrap.sh smoke

# ─────────────────────────── meta ───────────────────────────

# Repeatable verification: secret hygiene, SOPS round-trip, kustomize render,
# ui typecheck+tests, and kind smoke (if the cluster is up)
verify:
    tools/verify.sh

# Full local bring-up: secrets -> compose stacks
bootstrap: secrets-render up-all status
