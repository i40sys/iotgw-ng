---
id: decision-036
title: "036: Product release identity, build provenance and deployment diagnostics"
date: '2026-09-29 11:28'
status: accepted
---
## Context

Edge Manager comprises the browser UI, backend, edge functions, Kestra engine and workflows, Cosmian KMS, PostgreSQL and other services. Their package/image versions evolve independently. The former UI helper read `iotgw-ui/package.json` and showed that number as the application version even though it did not identify the deployed combination.

The repository already releases custom images from `vX.Y.Z` Git tags and pins production images by digest (decision-021). Kestra workflows have a separate source repository (`i40sys/iotgw-kestra`) and runtime database; the monorepo revision is not evidence of which workflows were synchronized. The browser may also keep old assets during a backend rollout.

## Decision

### One product release, independent component versions

Use the existing `vX.Y.Z` release tags as the human-readable Edge Manager product identity. Associate each release with a versioned, non-secret manifest of the intended component combination. Do not derive the product version from a package version, the largest component version, the current checkout, or a hostname.

Component package versions remain independent. Published release declarations must be retained with the deployment configuration; changing the intended combination requires a new release declaration/version. Re-deploying identical artifacts keeps the release version and produces a new verification snapshot.

### Header and deployment details

- A small, keyboard-accessible badge sits next to the Edge Manager brand and opens “About this deployment.” On narrower screens it sits below the brand, preserving navigation space.
- Development assets show `DEV · <short revision>`; `*` means the checkout was modified when Vite started. Development is identified by the build command, never by `localhost`.
- A production frontend displays the declared release returned by its backend. Without a valid declaration it shows `BUILD · <short revision>` or a localized unknown-version label. A package version is never substituted for a product release.
- The dialog shows the declared environment/release, manifest creation time, actual UI/backend package versions, full source revisions and build times, expected component identities, and any image verification timestamps. Manifest creation is explicitly not represented as the time the deployment completed.
- Differences appear in the badge and details. Missing metadata, an older backend and request failures preserve the browser build identity and provide clear recovery text.
- Diagnostic JSON can be copied; a selectable text field provides a fallback when clipboard access fails. English and Spanish are supported, matching the application’s existing locales.

### Build identity is independent of the deployment declaration

`iotgw-ui/build-metadata/build-info.mjs` creates a small allowlisted build record: component, package version, source revision, release tag, build time, dirty state and development flag.

Vite embeds the frontend record into its assets. The backend build script embeds a separate record into its bundle. A running production process never derives its build identity from the checkout or a mutable environment variable. Development servers read Git at startup, so a restart is needed after changing commits to update that identifier.

CI passes `IOTGW_BUILD_REVISION`, `IOTGW_BUILD_RELEASE` and `IOTGW_BUILD_DIRTY=false` to image builds. The kind build path passes its actual local revision/dirty state. Builds without provenance retain unknown values; they must not silently claim a clean release.

### Deployment metadata contract

The authenticated `getDeploymentInfo` tRPC query returns the running backend build plus a validated schema-v1 manifest, or an explicit missing/invalid state. It does not need a database query, cluster credentials or access to Secrets. The file comes from `IOTGW_RELEASE_MANIFEST_PATH` and is re-read to pick up projected ConfigMap updates. Unknown fields are stripped, file size is limited, and raw file contents/errors are never returned.

Each manifest contains:

- `schemaVersion: 1`, product `Edge Manager`, exact release tag, environment and creation time.
- Components with unique IDs; frontend and backend are mandatory.
- Per-component declared package version, source revision and/or full image reference; unknown values are explicit `null`.
- Optional Kubernetes workload identity and a timestamped observation of container image references, resolved image IDs and readiness.

All three overlays (kind, prod sketch and OVH) generate a non-secret `iotgw-release` ConfigMap from their own `release-manifest.json`. Initially the file is `null`: no existing environment is assigned an invented release. The backend mounts the ConfigMap directory read-only and tolerates its absence. OVH continues to apply the overlay through Terraform.

### Verification semantics

The frontend compares its own embedded identity and the responding backend’s embedded identity with the declaration. A different revision, package version, release tag, modified build or development build against a release declaration is a mismatch. Missing evidence is unverified.

`deploy/release-manifest.py generate` reads the exact Git tag and a locally rendered overlay, selecting only component identity fields. It records the latest migration filename as a target, and accepts the separate workflow source revision explicitly. It never reads or exports application credentials.

`verify` requires an explicit Kubernetes context and performs read-only workload/pod queries. It records all active replica image references and readiness, catching incomplete rollouts. A matching digest-pinned reference is image evidence; a matching mutable tag remains unverified for content identity. The image snapshot is dated evidence, not continuous health monitoring or proof that all database migrations/workflows were applied. External PKI/Netmaker/Galaxy services are outside this manifest’s automatic inventory.

Kestra workflow revisions and database migration targets remain unverified until a separate deployment mechanism supplies trustworthy runtime evidence. The implementation deliberately does not infer these from the Kestra engine image or local files.

### Release and rollout workflow

The [release runbook](../../deploy/RELEASE.md) documents image stamping, declaration generation, image verification and publication through the owning overlay. Image signature/provenance verification from decision-021 remains required independently of this informational UI.

This feature does not publish a Git tag, change image pins or deploy infrastructure automatically. Older backend/frontend images can roll forward independently; the UI reports unavailable/unverified identities until the corresponding images and declaration are installed.

## Consequences

- Operators can refer to one product release and copy the exact component evidence needed for support.
- Component teams retain independent versions. No extra manually synchronized “application version” is added to package files.
- A stale browser and a newer backend can be distinguished instead of being hidden behind one server-reported string.
- Release owners maintain the component declaration alongside image pins, re-record observations after rollout/rollback, and preserve previous declarations for incident analysis.
- The manifest is trusted operator-maintained metadata, not an attestation or a live inventory controller. Status labels communicate that limit.
- No database schema change, new Node dependency or additional backend Kubernetes privilege is required. The optional release CLI uses the existing Python/PyYAML and kubectl tooling.

Implementation tracked in task-148. Related decisions: decision-021 (image releases and provenance), decision-034 (operator authentication).
