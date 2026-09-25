#!/usr/bin/env bash
# Create (or update) an iotgw-ui operator in Supabase Auth (decision-034).
#
# Operators are GoTrue users with app_metadata.iotgw_role in {operator, admin}.
# Sign-up is disabled (GOTRUE_DISABLE_SIGNUP=true), so this admin-API call with
# the service role is the ONLY way to create one; app_metadata is writable only
# by the service role, so a user cannot grant the role to themselves.
#
# Usage:
#   scripts/operators/create-operator.sh <email> [role]
#   scripts/operators/create-operator.sh <email> [role] --password-from-env VAR
#   scripts/operators/create-operator.sh <email> [role] --reset
#   just operator-create <email> [role]
#
#   role                  operator (default) | admin
#   --password-from-env V take the password from environment variable V (never
#                         printed); otherwise a random one is generated and
#                         printed ONCE on stdout (everything else goes to stderr)
#   --reset               the user already exists: also set a new password
#                         (generated unless --password-from-env). Without it an
#                         existing user only gets its role updated.
#
# Environment:
#   GOTRUE_URL        GoTrue behind Kong (default http://localhost:8000/auth/v1,
#                     the kind NodePort mapping)
#   SERVICE_ROLE_KEY  service role JWT; default: read from the SOPS store
#                     (secrets/supabase.enc.env → SERVICE_ROLE_KEY)
#
# Requires: curl, jq, openssl (and sops + the age key if SERVICE_ROLE_KEY is unset).

set -euo pipefail

die() { echo "create-operator: $*" >&2; exit 1; }
log() { echo "create-operator: $*" >&2; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GOTRUE_URL="${GOTRUE_URL:-http://localhost:8000/auth/v1}"
GOTRUE_URL="${GOTRUE_URL%/}"

email=""; role="operator"; pw_env=""; reset=0
positional=()
while [ $# -gt 0 ]; do
  case "$1" in
    --password-from-env) [ $# -ge 2 ] || die "--password-from-env needs a variable name"; pw_env="$2"; shift 2 ;;
    --reset) reset=1; shift ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option: $1" ;;
    *) positional+=("$1"); shift ;;
  esac
done
[ "${#positional[@]}" -ge 1 ] || die "usage: $0 <email> [operator|admin] [--password-from-env VAR] [--reset]"
email="$(printf '%s' "${positional[0]}" | tr '[:upper:]' '[:lower:]')"
[ "${#positional[@]}" -ge 2 ] && role="${positional[1]}"
[ "${#positional[@]}" -le 2 ] || die "too many arguments"
case "$role" in operator|admin) ;; *) die "role must be 'operator' or 'admin' (got '$role')" ;; esac
[[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "not an email address: $email"
for bin in curl jq openssl; do command -v "$bin" >/dev/null || die "$bin not found"; done

key="${SERVICE_ROLE_KEY:-}"
if [ -z "$key" ]; then
  command -v sops >/dev/null || die "SERVICE_ROLE_KEY unset and sops not found"
  key="$(sops --decrypt --input-type dotenv --output-type dotenv "$REPO_ROOT/secrets/supabase.enc.env" \
        | grep -E '^SERVICE_ROLE_KEY=' | head -1 | cut -d= -f2-)" || true
  [ -n "$key" ] || die "could not read SERVICE_ROLE_KEY from secrets/supabase.enc.env"
fi

password=""; generated=0
if [ -n "$pw_env" ]; then
  password="${!pw_env:-}"
  [ -n "$password" ] || die "environment variable $pw_env is empty or unset"
  [ "${#password}" -ge 12 ] || die "password from $pw_env is shorter than 12 characters"
fi
gen_password() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-32; }

# admin <METHOD> <path> [json-body]  → prints "<http-code>\n<body>"
admin() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "$GOTRUE_URL$path"
    -H "apikey: $key" -H "Authorization: Bearer $key"
    -H 'Content-Type: application/json' -w '\n%{http_code}')
  [ -n "$body" ] && args+=(--data-binary @-)
  if [ -n "$body" ]; then printf '%s' "$body" | curl "${args[@]}"; else curl "${args[@]}"; fi
}
parse_resp() { # sets RESP_BODY / RESP_CODE from admin output
  RESP_CODE="$(printf '%s' "$1" | tail -n1)"
  RESP_BODY="$(printf '%s' "$1" | sed '$d')"
}

find_user_id() {
  local page=1 out id
  while :; do
    parse_resp "$(admin GET "/admin/users?page=$page&per_page=200")"
    [ "$RESP_CODE" = 200 ] || die "listing users failed (HTTP $RESP_CODE)"
    id="$(printf '%s' "$RESP_BODY" | jq -r --arg e "$email" '.users[] | select((.email // "" | ascii_downcase) == $e) | .id' | head -1)"
    if [ -n "$id" ]; then echo "$id"; return 0; fi
    out="$(printf '%s' "$RESP_BODY" | jq '.users | length')"
    [ "$out" -ge 200 ] || return 1
    page=$((page + 1))
  done
}

user_id="$(find_user_id || true)"

if [ -z "$user_id" ]; then
  if [ -z "$password" ]; then password="$(gen_password)"; generated=1; fi
  body="$(jq -n --arg e "$email" --arg p "$password" --arg r "$role" \
    '{email:$e, password:$p, email_confirm:true, app_metadata:{iotgw_role:$r}}')"
  parse_resp "$(admin POST /admin/users "$body")"
  [ "$RESP_CODE" = 200 ] || [ "$RESP_CODE" = 201 ] \
    || die "creating $email failed (HTTP $RESP_CODE): $(printf '%s' "$RESP_BODY" | jq -r '.msg // .message // .error_description // .error // "unknown error"' 2>/dev/null)"
  user_id="$(printf '%s' "$RESP_BODY" | jq -r '.id')"
  log "created operator $email (role $role, id $user_id)"
else
  if [ "$reset" = 1 ] && [ -z "$password" ]; then password="$(gen_password)"; generated=1; fi
  if [ -n "$password" ]; then
    body="$(jq -n --arg p "$password" --arg r "$role" '{password:$p, app_metadata:{iotgw_role:$r}}')"
  else
    body="$(jq -n --arg r "$role" '{app_metadata:{iotgw_role:$r}}')"
  fi
  parse_resp "$(admin PUT "/admin/users/$user_id" "$body")"
  [ "$RESP_CODE" = 200 ] \
    || die "updating $email failed (HTTP $RESP_CODE): $(printf '%s' "$RESP_BODY" | jq -r '.msg // .message // .error // "unknown error"' 2>/dev/null)"
  if [ -n "$password" ]; then
    log "operator $email already existed: role set to $role, password replaced (id $user_id)"
  else
    log "operator $email already existed: role set to $role, password unchanged (id $user_id; --reset to replace it)"
  fi
fi

if [ "$generated" = 1 ]; then
  log "password for $email (shown ONCE — store it now, it is not recoverable):"
  printf '%s\n' "$password"
fi
