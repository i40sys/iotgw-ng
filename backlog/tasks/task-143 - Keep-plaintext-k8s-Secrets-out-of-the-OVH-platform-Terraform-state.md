---
id: TASK-143
title: Keep plaintext k8s Secrets out of the OVH platform Terraform state
status: To Do
assignee: []
created_date: '2026-09-29 10:37'
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
**Why.** `deploy/terraform/ovh/platform` reads the SOPS files and creates `kubernetes_secret_v1` resources plus the device-API private key (`tls_private_key`), so the state object `ovh/platform.tfstate` in the OVH S3 bucket `iotgw-ng-tfstate-28f191` holds them in clear text.

**Options to evaluate:**
- Keep it, but lock down the bucket: dedicated S3 user (done: `iotgw-ng-terraform-state`), bucket policy, server-side encryption, versioning retention.
- Move Secrets out of Terraform: SOPS → k8s via a controller (e.g. sops-secrets-operator / external-secrets), or `tf.sh` + `kubectl apply` outside the state.
- Issue the device-API cert outside Terraform (e.g. cert-manager CA Issuer holding the device-API CA).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decision recorded (ADR) on how OVH Secrets are delivered
- [ ] #2 Chosen option implemented; platform state no longer holds secret values, or the bucket is encrypted + access-restricted with evidence
<!-- AC:END -->
