<!-- PUBLIC-SAFE runbook (this monorepo is public on GitHub). Do NOT add live
     device IPs/MACs, credentials, or private hostnames here. Real device
     specifics + the UniFi discovery command live in engram (private). -->

# Kestra OpenWRT flows — CLI testing & validation

Concrete CLI runbook to inspect, deploy, run, monitor and validate the
`iotgw-ng` flows (`install` / `provisioning` / `connectivity-check`) on the local
kind cluster, plus validating a real gateway. Flow YAML + playbooks live in the
public repo **github.com/i40sys/iotgw-kestra** (synced into Kestra by
`sync-namespace-files`). Secrets are never in git — they come from Kestra KV
(`{{ kv('X') }}` in flows) or ansible extra-vars at runtime.

## 0. Safety (NON-NEGOTIABLE)

- **Non-destructive only** against real gateways: `connectivity-check` / `ansible -m ping` / read-only. **NEVER** `install` or `provisioning` (disk wipe / reflash) against live hardware.
- **Banned target ranges:** `192.168.4.0/24` and `10.121.0.0/16` — never point a flow/ansible at them. For a target you won't really reach, use the dummy `0.0.0.0`. Re-check every discovered IP against the ban list first.
- Device specifics (IPs/MACs, the UniFi discovery command) live in engram (private), not here. Don't add live device addresses or credentials to this runbook.

## 1. Shell setup (every recipe below assumes this)

Purpose: Kestra API base + basic-auth (creds from SOPS, never hardcoded) and a small auth helper.

```bash
cd /home/oriol/iotgw-ng
export KBASE=http://wsl.ymbihq.local:8080/api/v1
export KAUTH="$(sops -d secrets/kestra.enc.env | sed -nE 's/^KESTRA_BASIC_AUTH_USERNAME=//p'):$(sops -d secrets/kestra.enc.env | sed -nE 's/^KESTRA_BASIC_AUTH_PASSWORD=//p')"
kq() { curl -fsS -u "$KAUTH" "$@"; }   # authenticated Kestra API call
kubectl get ns kestra >/dev/null && echo cluster-ok   # kubectl must point at the kind cluster
```

## 2. Prerequisites for the KMS key fetch (task-069)

Purpose: runner pods fetch the device SSH key from Cosmian KMS; without these the pod fails.

```bash
kubectl get secret kms-auth -n kestra                                   # must exist (bootstrap.sh gen_kms_auth_secret); else: kubectl get secret kms-auth -n iotgw-ui -o json | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp)' | kubectl apply -n kestra -f -
kq "$KBASE/namespaces/iotgw-ng/files/directory" | jq -r '.[].fileName' | grep -x fetch_kms_key.py   # KMS helper must be a root namespace file
```

## 3. Inspect registered flows

Purpose: see what is deployed (id + revision) and dump a flow's exact source.

```bash
kq "$KBASE/flows/search?namespace=iotgw-ng&size=50" | jq -r '.results[]|"\(.id) rev=\(.revision)"'
kq "$KBASE/flows/iotgw-ng/connectivity-check?source=true" | jq -r '.source'
```

## 4. Validate + deploy a flow change

Purpose: validate YAML offline, then publish. Flow source is the public repo
`github.com/i40sys/iotgw-kestra`; `sync-namespace-files` pulls it into Kestra; the
runtime registration is a `PUT`. Do BOTH — a git push alone does NOT update the
running flow. Secrets stay out of git: flows read `{{ kv('NAME') }}` (set values
with `PUT $KBASE/namespaces/iotgw-ng/kv/NAME`, `Content-Type: text/plain`), and
ansible vars come from `json_data` extra-vars at run time.

```bash
CLONE=~/src/iotgw-kestra   # git clone https://github.com/i40sys/iotgw-kestra "$CLONE"

# a) validate (no save): constraints:null == valid; non-null lists the errors
kq -X POST "$KBASE/flows/validate" -H 'Content-Type: application/x-yaml' \
   --data-binary @"$CLONE/connectivity-check-flow.yaml" | jq '.[]|{flow,constraints}'

# b) source -> public GitHub
git -C "$CLONE" commit -am 'flow change' && git -C "$CLONE" push origin HEAD

# c) pull namespace files (scripts/playbooks/templates) from GitHub into Kestra
kq -X POST "$KBASE/executions/iotgw-ng/sync-namespace-files" -H 'Content-Type: multipart/form-data' | jq -r '.id'

# d) register the flow in the live DB (returns the new revision; HTTP 4xx + .message == invalid)
kq -X PUT "$KBASE/flows/iotgw-ng/connectivity-check" -H 'Content-Type: application/x-yaml' \
   --data-binary @"$CLONE/connectivity-check-flow.yaml" | jq -r '.revision'
```

## 5. Trigger a run from the CLI

Purpose: start an execution; inputs are multipart form fields keyed by input id. ALWAYS dummy target unless validating a real, non-banned device.

```bash
# connectivity-check: separate inputs target_ip + ssh_key_id
EXID=$(kq -X POST "$KBASE/executions/iotgw-ng/connectivity-check" \
  -F target_ip=0.0.0.0 -F ssh_key_id=device_ssh_<deviceId> | jq -r '.id'); echo "$EXID"

# install / provisioning: a single json_data JSON input (target_ip + ssh_key_id inside it)
kq -X POST "$KBASE/executions/iotgw-ng/provisioning" \
  -F 'json_data={"target_ip":"0.0.0.0","ssh_key_id":"device_ssh_<deviceId>","target_disk":"/dev/sda","openwrt_version":"23.05.4","__tags__":[]}' | jq -r '.id'
```

Get a real `ssh_key_id` from the device row (KMIP id = `device_ssh_<deviceId>`):
```bash
kubectl exec -n supabase-db supabase-db-0 -c patroni -- \
  psql -U postgres -d postgres -At -c "select name,ssh_key_id,ip_address from devices where ssh_key_id is not null;"
```

## 6. Monitor the execution

Purpose: poll overall + per-task state, read logs, kill if needed.

```bash
kq "$KBASE/executions/$EXID" | jq -r '"exec="+.state.current, (.taskRunList[]|"  \(.taskId): \(.state.current)")'
kq "$KBASE/logs/$EXID/download" | tail -50          # task logs (incl. KMS fetch + ansible output)
kq -X DELETE "$KBASE/executions/$EXID/kill"          # stop a slow/stuck run
```

## 7. Inspect the runner pod (PodCreate)

Purpose: the PodCreate task spawns a `managed-by=kestra` pod in the `kestra` ns. Verify env
injection, what files landed, and the ansible/KMS output.

```bash
POD=$(kubectl get po -n kestra -l kestra.io/flow=connectivity-check --sort-by=.metadata.creationTimestamp -o jsonpath='{.items[-1:].metadata.name}')
# env injection (SSH_KEY_ID rendered from input; KMS_AUTH_TOKEN from secretKeyRef kms-auth)
kubectl get po -n kestra "$POD" -o jsonpath='{range .spec.containers[0].env[*]}{.name}={.value}{.valueFrom.secretKeyRef.name}{"\n"}{end}'
kubectl exec -n kestra "$POD" -c init-files -- find /kestra/working-dir -type f   # injected files (while Init)
kubectl logs -n kestra "$POD" -c ansible                                          # KMS fetch + ansible PLAY
```

## 8. Expected good outcomes

- **connectivity-check, dummy target:** pod log shows `materialized keys/id_rsa from KMS key …`, then ansible `PLAY` → `UNREACHABLE! … 0.0.0.0 port 22` (correct with no real target). Execution ends FAILED (ansible non-zero) — that is the expected "ready" signal.
- **Real reachable device (SSH open, see §10):** ansible reports `ping: "pong"`, `changed: false`.
- **`validFilename` / leading-slash error or instant ~0.13s fail** = the task-065 fix regressed.

## 9. Caveats

- **fileSidecar marker lag ~4.5 min** (kind/WSL2): pod sits `Init:0/1` while Kestra writes `/kestra/ready`. Files in SUBDIRECTORIES stall — keep runner-needed files at the repo **root** (connectivity-check stages only `connectivity_check.yml` + `fetch_kms_key.py`).
- A flow input that has a `defaults` must be `required: true` (else PUT 422).
- `cryptography` is in the image venv (`/opt/venv`); do not mount volumes over `/opt`.

## 10. Validate against a real gateway (non-destructive)

The exact UniFi discovery command and the current test-device IP/MAC are in engram
(private), not this public file. Process:

1. Discover the gateway IP from the UniFi controller (DHCP — re-discover each run).
2. Re-confirm the IP is NOT in a banned range (§0).
3. Validate (read-only; nothing is modified):

```bash
IP=<discovered-ip>
ping -c2 -W2 "$IP"                                       # alive on the network
timeout 6 bash -c "exec 3<>/dev/tcp/$IP/22" && echo 22-open   # SSH is GATED — open port 22 on the device if filtered
ssh-keygen -f ~/.ssh/known_hosts -R "$IP"               # clear stale host key (DHCP reuse) on "IDENTIFICATION HAS CHANGED"
ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes root@"$IP" 'uname -a; uptime; command -v python3'
uv run --no-project --with ansible env ANSIBLE_HOST_KEY_CHECKING=False \
  ansible all -i "$IP," -u root -m ping --forks 1        # expect SUCCESS / ping: pong (--forks 1 avoids a uv-venv "dead worker")
```

Notes: the gateway only accepts SSH over the VPN/bastion path unless port 22 is opened on it —
re-probe tcp/22 each session.
