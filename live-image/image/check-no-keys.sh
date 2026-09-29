#!/usr/bin/env bash
# Fail if an unpacked image tree contains SSH key material (task-149.01: the
# served image must carry no SSH keys — host keys are generated at boot by
# live-config, access is via the SSH CA installed by iotgw-bootstrap).
#   check-no-keys.sh <tree> [<tree>...]
set -euo pipefail
status=0
for root in "$@"; do
  [ -d "$root" ] || { echo "no such tree: $root" >&2; exit 2; }
  hits="$(find "$root" -xdev \( -type f -o -type l \) \( \
      -name 'ssh_host_*_key' -o -name 'ssh_host_*_key.pub' \
      -o -name 'authorized_keys' -o -name 'authorized_keys2' \
      -o -name 'id_rsa' -o -name 'id_dsa' -o -name 'id_ecdsa' -o -name 'id_ed25519' \
      -o -name 'id_ecdsa_sk' -o -name 'id_ed25519_sk' \) -print 2>/dev/null || true)"
  pem="$(grep -rlI --exclude-dir=proc --exclude-dir=sys \
      -E -- '-----BEGIN (OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----' "$root" 2>/dev/null || true)"
  if [ -n "$hits$pem" ]; then
    echo "SSH key material found in $root:" >&2
    printf '%s\n' $hits $pem | sed 's/^/  /' >&2
    status=1
  else
    echo "no SSH key material in $root"
  fi
done
exit $status
