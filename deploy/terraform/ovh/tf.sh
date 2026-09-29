#!/usr/bin/env bash
# Run terraform for an OVH root module with the OVH API + S3 state credentials
# decrypted from SOPS into the environment only (never written to disk).
#   deploy/terraform/ovh/tf.sh infra plan
#   deploy/terraform/ovh/tf.sh platform apply
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
module="${1:?usage: tf.sh <infra|platform> <terraform args...>}"; shift
[ -d "$here/$module" ] || { echo "no module $module" >&2; exit 1; }
exec sops exec-env "$root/secrets/ovh.enc.env" \
  "terraform -chdir='$here/$module' $(printf '%q ' "$@")"
