---
id: TASK-143
title: >-
  Lock down the OVH Terraform state bucket (platform state holds plaintext
  Secrets)
status: To Do
assignee: []
created_date: '2026-09-29 10:37'
updated_date: '2026-09-29 15:01'
labels:
  - security
  - ovh
  - terraform
dependencies:
  - TASK-142
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Why.** `deploy/terraform/ovh/platform` reads the SOPS files and creates `kubernetes_secret_v1` resources plus the device-API private key (`tls_private_key`), so the state object `ovh/platform.tfstate` in the OVH S3 bucket `iotgw-ng-tfstate-28f191` (GRA) holds them in clear text.

**Decision (user, 2026-09-29): keep the Secrets in Terraform state and lock the S3 bucket down.** Moving Secrets out of Terraform (sops/external-secrets operator, cert-manager CA issuer) is **not** pursued now; revisit only if the bucket controls prove insufficient.

**Controls to implement:**
- **Dedicated S3 user only.** `iotgw-ng-terraform-state` (OVH project user 815403, role `objectstore_operator`) is the only identity with access to the bucket; its S3 credentials live only in `secrets/ovh.enc.env` (SOPS). No other project user or credential can list/read/write it.
- **Bucket policy.** Explicit allow for that user's ARN on `iotgw-ng-tfstate-28f191` and `iotgw-ng-tfstate-28f191/*` (Get/Put/Delete/List + versioning), deny everything else; no public ACLs / anonymous access.
- **Least privilege for the user.** The user's own policy is scoped to this bucket only (not every container in the project).
- **Encryption at rest.** Server-side encryption enabled on the bucket (OVH SSE, AES256) and verified on the existing state objects (re-upload/rewrite if they predate it).
- **Versioning + retention.** Versioning stays on; lifecycle rule expires noncurrent versions after a bounded window (e.g. 30 days) so old plaintext copies do not accumulate indefinitely.
- **Transport.** HTTPS endpoint only (already `https://s3.gra.io.cloud.ovh.net`); deny non-TLS requests in the policy if supported.
- **Local hygiene.** No local `*.tfstate` / plan files (already gitignored); `tf.sh` keeps credentials in the process environment only.
- **Codified.** Bucket policy, encryption and lifecycle are managed as code (a small bootstrap Terraform/script under `deploy/terraform/ovh/bootstrap/`, separate from the state it protects) and documented in `deploy/terraform/ovh/README.md`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision recorded: Secrets stay in Terraform state, protected by S3 bucket controls (this task + README)
- [ ] #2 Only the dedicated user iotgw-ng-terraform-state can access the bucket; another project credential is denied (evidence)
- [ ] #3 Bucket policy applied: allow that user only, deny all else, no public/anonymous access, TLS-only
- [ ] #4 Server-side encryption enabled and confirmed on ovh/infra.tfstate and ovh/platform.tfstate
- [ ] #5 Versioning on with a lifecycle rule expiring noncurrent versions
- [ ] #6 Bucket controls managed as code under deploy/terraform/ovh/bootstrap/ and documented in the README
<!-- AC:END -->
