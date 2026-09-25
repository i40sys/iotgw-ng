---
id: TASK-130
title: >-
  Provisioning configuration: one deployment JSON schema + playbook variable
  contract
status: Done
assignee: []
created_date: '2026-09-24 19:39'
updated_date: '2026-09-25 05:31'
labels:
  - kestra
  - ansible
  - provisioning
  - ui
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Kestra `provisioning` flow (i11_provisioning_iotgw.yaml) failed on gw-c3 (exec IeBFGp5yquThkwufsKKSp) at tasks/system.yaml "system: configuration" with `'primary_ntp' is undefined`: the UI only produced the placeholder config. Define the variable contract of the provisioning playbook, make the playbook fail fast and clearly on a bad config, and publish ONE JSON Schema for the whole deployment configuration (osInstallation + provisioning) that the UI renders as forms per wizard step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every variable used by the provisioning playbook, its imported tasks, templates and vendored stack templates is inventoried (type, consumer tag, required/optional, secret)
- [x] #2 The inventory is diffed against the operator's Ansible-Forms key list (missing / unused / renamed / type issues)
- [x] #3 The playbook accepts the JSON key names, asserts required vars per enabled stack before touching the gateway, and marks secret-bearing tasks no_log
- [x] #4 templates/network.j2 no longer depends on operator-supplied WireGuard values: wg0 is read back from the gateway and asserted before /etc/config/network is rewritten
- [x] #5 Dangerous demo play vars (hostname, root_password none, local_ip_address) are removed in favour of required-and-asserted
- [x] #6 iotgw-ui/packages/supabase-contract/src/deployment-config.schema.json (draft 2020-12, x-step/x-group/x-secret, if/then per stack) + an example that validates against it
- [x] #7 ansible-playbook --syntax-check passes in the pinned runner image and the templates render with the placeholder config
- [x] #8 Open decision recorded: where provisioning secrets are stored (deployments.configuration jsonb vs Cosmian KMS)
- [x] #9 UI: the O.S. Installation and Provisioning wizard steps render their fields from the schema (x-step/x-group), with a Form ⇄ JSON toggle over the same configuration and masked secrets
- [x] #10 Backend: executeKestraDeployment refuses a provisioning run whose configuration fails the schema (BAD_REQUEST naming the fields) and never logs configuration values
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Context**
- gw-c3 provisioning (Kestra exec IeBFGp5yquThkwufsKKSp) passed the gekmihesg.openwrt role + packages, then died in `tasks/system.yaml` "system: configuration" on `'primary_ntp' is undefined` — the UI only produced the placeholder config.
- Operator-supplied shape: memory `provisioning-config-shape`. Real values are a client's live credentials — never stored here; placeholders only.

**Deliverables**
- Schema: `iotgw-ui/packages/supabase-contract/src/deployment-config.schema.json` (draft 2020-12; `x-step`, `x-group`, `x-secret` + `writeOnly`, `x-stack-tag`, `x-unused`, `x-advanced`; `x-step: backend` for keys the backend injects, `x-step: legacy` + `deprecated` for name/version/services/networks/resources). Exported as `deploymentConfigSchema` from `@iotgw/supabase-contract` (`resolveJsonModule`).
- Example: `deployment-config.example.json` — validates (jsonschema, FormatChecker); every secret is `CHANGE_ME`, which preflight rejects, so it can never be applied as-is.
- iotgw-kestra branch `task-130-provisioning-schema` (commit 6a9ee43, not pushed, not merged, flows not deployed).

**Variable inventory (required = asserted by tasks/preflight.yaml when the stack runs; * = secret)**

| Variable | Type | Used by (tag) | Required |
|---|---|---|---|
| iotgw_hostname | string | system/ntp (system.j2), mosquitto (bridge client id), nodered (env, flows repo) | system, ntp, mosquitto, nodered |
| root_password* | string | system (root sha512), vscode (code-server PASSWORD) | system, vscode |
| local_ip_address | ipv4 | system (network.j2 lan, dhcp.j2), firewall (MQTT DNAT), mosquitto (listener), plc_sniffer | yes |
| local_domain | string | system (dhcp.j2, network.j2 dns_search) | yes (schema default localdomain) |
| main_local_dns | ipv4 | system (dhcp.j2), observability (uptime) | system |
| backup_local_dns | ipv4 | observability (uptime env only) | optional |
| primary_ntp | host/ip | system, ntp | yes |
| secundary_ntp | host/ip | system, ntp | optional (alias secondary_ntp) |
| dhcp_hosts[{name,ip,mac}] | list | system | optional |
| deploy_shared_ssh_key | bool | system (break-glass id_rsa) | optional, false |
| wg0: vpn_private_key*, vpn_ip_address, vpn_public_key, vpn_server_ip, vpn_server_port | string | system (network.j2) | NOT from JSON any more — read back from the gateway (uci); vpn_* only a fallback |
| allowed_internet[{ip}], management_cidrs[{cidr}] | list | firewall | optional |
| ghcr_pat* | string | credentials, glpi-agent (docker login ghcr.io) | credentials, glpi-agent |
| notion_api_key* | string | credentials | credentials |
| alloy_log_level, prometheus_url, prometheus_oauth2_{token_url,client_id,client_secret*}, loki_url, loki_oauth2_{token_url,client_id,client_secret*} | string/uri | observability (alloy base/writers) | observability |
| kuma_exporter_username, kuma_exporter_password* | string | observability (alloy metrics) | observability |
| containers_exporter_port | int | observability (containers_exporter env) | observability |
| num_maquina, uptime_kuma_port, mqtt_username, mqtt_password*, autokuma_username, autokuma_password*, mqtt_hostname, mqtt_port, factory_mqtt_host, factory_gw_host, iiot_server_host, internet_dns | mixed | observability (uptime env.j2) | optional — LEGACY client defaults in the template |
| emqx_api_url, emqx_api_key, emqx_api_secret*, iiot_host, iiot_mqtt_user, iiot_mqtt_password*, mqtt_bridge_topics[] (new) | string/list | mosquitto | mosquitto |
| users[{username,password*}] | list | mosquitto (mosquitto_passwd) | optional |
| glpi_server, glpi_user, glpi_password* | string | glpi-agent | glpi-agent |
| telegraf_config_url, influx_token* | string | telegraf | telegraf |
| duplicati_access_password*, duplicati_docker_target_url*, duplicati_system_target_url* | string | duplicati (env, import jobs) | duplicati |
| nodered_user, nodered_password*, github_org | string | nodered | nodered |
| netxms_server_port, netxms_web_port, netxms_server_ip, netxms_master_servers, netxms_debug_level, proxy_agent, proxy_snmp | mixed | netxms (env), firewall (netxms rule) | netxms |
| iotgw_ssh_ca_base_url, device_id, device_uuid, network_id, domain_id, totp_counter, pki_zone, target_ip, ssh_key_id, supabase_anon_key* | mixed | ssh_ca + flow | backend-injected; ssh_ca has its own no-op logic |
| openwrt_* (gekmihesg.openwrt defaults) | mixed | role | all defaulted; needs the host in group `openwrt` (flow inventory does it) |

**Diff vs the operator's key list**
- Missing from the JSON but needed: `mqtt_bridge_topics` (new — mosquitto.conf.j2 had hard-coded client topics), `github_org` (nodered), uptime-kuma knobs (optional; template falls back to client defaults), wg0 values (now read from the gateway, deliberately not in the JSON).
- In the JSON but used by nothing: `iotgw_ip` (only the old inventory playbook), `zerotier_network_id`, `zerotier_secret` (templates/zerotier.j2 is orphaned). Before this task the bool flags and `iiot_host` were unused too (mosquitto.conf.j2 was never vendored).
- Renamed / aliased: play var `zeroter_network_id` removed (typo, unused); `secundary_ntp` kept, `secondary_ntp` accepted; `glpi-agent` (hyphenated, read via `lookup('vars', 'glpi-agent')`), `glpi_agent` accepted.
- Flags vs tags: before, ONLY `__tags__` gated stacks; the bools were ignored. Now a stack runs when its tag is selected (empty `__tags__` = all) AND its flag is not false. Mapping: firewall→firewall, credentials→credentials, obs→observability, mqtt→mosquitto, glpi-agent→glpi-agent, duplicati, telegraf, nodered, netxms. The operator's `ntp` tag did not exist (silently matched nothing) — added on the /etc/config/system task. Tags lldpd, plc_sniffer, ssh_ca were absent from the operator's list; `ssh_ca` must be in a non-empty `__tags__` for enrollment.
- Types: ports and netxms_debug_level accepted as int or digit-string; proxy_agent/proxy_snmp are the strings "yes"/"no"; num_maquina int 0–9 (uptime builds 10.121.10<n>).

**Playbook changes (iotgw-kestra 6a9ee43)**
- `tasks/preflight.yaml` (new, pre_tasks, controller-only): unknown-tag check, per-stack required-var assert (undefined/empty/CHANGE_ME), value shapes, vendored-template presence.
- `i11_provisioning_iotgw.yaml` (CRLF kept): demo vars removed; flagged imports gated on `iotgw_stack_enabled`.
- `tasks/system.yaml` + `templates/network.j2`: wg0 read back via uci, asserted before the wholesale rewrite; network file 0600; previous file copied to /root/.iotgw-provisioning-backup; root password task no_log; dhcp_hosts after the dhcp template + `uci commit dhcp`.
- `templates/firewall.j2`: keeps the install-time `vpn` zone for wg0; netxms rule from netxms_server_ip (was hard-coded client IP). `tasks/firewall.yaml`: `cut -f 1`.
- mosquitto: vendored `etc/mosquitto.conf.j2` (+ .gitignore fix), EMQX user looked up by id (200/404), no_log. nodered: password via env, hash not printed. no_log on every secret-rendering template.
- `Flow.yaml`: logs json_data key names only; json_data passed as `-e @vars.json` (inputFiles) instead of inlined into the pod command.

**Validation**
- `ansible-playbook --syntax-check` OK in cytopia/ansible:2.18-tools@sha256:da5e5a60… (ansible-core 2.18.19) with gekmihesg.openwrt @01fda612.
- Controller-only harness (localhost): all provisioning + stack templates render with the filled placeholder config; preflight fails clearly on the raw example (CHANGE_ME), a missing primary_ntp, an unknown tag, and nodered on; `--tags ntp` lists only preflight + /etc/config/system.
- Nothing was run against any gateway; the flow was not deployed.

**Risks / findings**
- network.j2 rewrote /etc/config/network wholesale incl. wg0 from vars nobody supplied — at the next network reload/reboot a gateway reached only through the VPN would be locked out. Now re-emitted from the live config and asserted; still wholesale (lan /26 netmask, eth1–eth5 bridge, wan=eth0 DHCP are hard-coded).
- firewall.j2 silently dropped the install-time `vpn` zone (fixed); still hard-codes ManagementIPs 10.2.0.47/32.
- files/stacks/uptime/env.j2 is client-specific (domain, topics, 192.168.x addresses) and defaults two passwords to a shared literal in the PUBLIC repo — follow-up.
- nodered cannot be provisioned from the public repo (data/.config.projects.json.j2 + SSH deploy keys not vendored); preflight fails it clearly.
- Flow.yaml edits (`keys` filter, `vars.json` inputFile) need a Kestra validate before the merge.
- The operator's pasted example held live client credentials — rotate them.

**Open decision**
- Where provisioning secrets live: `deployments.configuration` jsonb (plaintext in Postgres + deployment_jobs.configuration_json copies) vs Cosmian KMS (store refs, resolve in the backend at execution). Not implemented.

**Remaining**
- UI: render the Provisioning step from the schema (per x-group, mask x-secret); backend: validate against the schema before executeKestraDeployment.
- Merge + deploy the iotgw-kestra branch, then re-run provisioning on a lab gateway (task-129 AC#1).

**UI + backend (task-130 part 2).** Both wizard steps now render from the ONE schema; provisioning runs are validated server-side.

**Shared validator**
- `packages/supabase-contract/src/deployment-config.validate.ts` — `validateDeploymentConfigStep(config, step)` builds the step sub-schema (that step's properties, required keys and if/then rules; other keys allowed so unknown keys round-trip) and validates it with **ajv 2020 + ajv-formats**. ajv@8.17.1 / ajv-formats@3.0.1 were already in the lockfile (fastify); a hand-rolled validator for 2020-12 + if/then + anyOf-format would drift from the playbook contract.
- Messages name fields only (never values): `iiot_host is required when \`mqtt\` is enabled`, `primary_ntp must be a valid ipv4 or hostname`; also flags `CHANGE_ME` left in currently-required keys (preflight rejects them too).
- Imported by RELATIVE path from both apps: the contract's `dist/` is not built/shipped in the images and the backend bundles with `--packages=external`, so a package import would break at runtime. (Contract tsconfig got target/module ES2020/bundler so it typechecks.)

**UI (apps/app)**
- `lib/deployment-config-form.ts` — schema → groups/fields (`x-group`, stack flag via `x-stack-tag`, widget kind from type/enum/items/x-secret, `x-advanced`/`x-unused` folded under "advanced"), immutable `getIn/setIn`, `withStepDefaults`.
- `components/deployment-steps/schema-step-form.tsx` — generic renderer on shadcn: collapsible section per group, stack switch first (off → its fields hidden unless another enabled stack requires them, e.g. `ghcr_pat` for GLPI), secrets as password inputs with show/hide, enum → Select, `__tags__` → checkboxes, object arrays (`dhcp_hosts`, `users`, `allowed_internet`, `management_cidrs`) and `mqtt_bridge_topics` with add/remove rows, per-field errors.
- `config-step-editor.tsx` — Form ⇄ JSON toggle. The page's configuration JSON is the only state: each form edit sets ONE key on the whole document, so other-step/backend/legacy/unknown keys survive. The JSON view shows the WHOLE document (both steps edit it; makes the round-trip obviously lossless); unparsable drafts stay in Monaco and are never propagated. Schema defaults are displayed and stored on the first edit (or "Apply defaults").
- `provisioning-step.tsx` replaces the raw Monaco tab (keeps "Load from file"); `os-installation-step.tsx` now uses the same renderer (help table kept). Deploy pre-checks provisioning with the same validator (toast lists field names only). i18n keys in en.json + es.json (`deployments.steps.config.*`); labels/descriptions come from the schema.

**Backend (apps/backend)**
- `executeKestraDeployment`, `flow_type: provisioning` → BAD_REQUEST `Provisioning configuration is invalid (N problems): …` before Kestra is called; configuration otherwise passed unchanged. Install path unchanged.
- Save paths (`createDeployment`/`updateDeployment`) deliberately NOT validated: steps are completed progressively and drafts must save.
- No secret logging: `utils/redact.ts` (`redactForLog`) used by the query/mutation helpers' error logs (they logged the whole input, incl. `configuration`); pino `redact` paths as defense in depth.

**Verification**
- Backend vitest 16/16 (new `provisioningConfig.test.ts`: valid passes + passthrough, enabled-stack missing field → BAD_REQUEST naming it and no secret in logs, CHANGE_ME, disabled stack OK, install unaffected, redaction). App vitest 22/22 (new `config-step-editor.test.tsx`). Typecheck backend/app/contract OK; `vite build` + backend esbuild bundle OK.
- Visual check on the dev stack (gw-c3, nothing saved or executed): 12 provisioning sections render, O.S. step renders from schema.

**Open**
- **Secret storage decision still open**: secrets live in `deployments.configuration` jsonb and are copied to `deployment_jobs.configuration_json` in plaintext; Cosmian KMS refs would need a resolve step in the backend. The JSON view shows secrets in plain text (by design of a raw editor).
- The example's placeholder values (`examples`) show as input placeholders; the page still auto-adds legacy `name`/`version` keys on deploy (old zod schema) — harmless, deprecated in the schema.

**Decision (user, 2026-09-25): secrets stay in the deployment JSON** (`deployments.configuration`, copied to `deployment_jobs.configuration_json`), not in Cosmian KMS. Mitigations already in place: password inputs, no secret values in logs/toasts/validation messages, tRPC helper redaction.

**Merge + deploy (2026-09-25)**

**UI fix before the merge (`967caf4`)**
- The deployments page is a viewport-height column: the form scrolls in its own region (`data-slot=deployments-scroll`, `overscroll-contain`) and `DeploymentActionsPanel` is an in-flow footer row, no longer `fixed` over the content — it cannot cover "Stacks to run" (or anything else) while scrolling.
- Dev only: the bar reserves the bottom corners (`pl-44 pr-16`) where the TanStack Router/Query devtools toggles sit, so they cover neither its buttons nor the form.
- Provisioning "Load from file" input: `hidden` instead of `sr-only` (Input's `w-full` beat sr-only's 1px width → ~100px horizontal page overflow).
- Verified headless with agent-browser on the dev stack (comforsa / c3 / gw-c3, Provisioning step, scrolled; 1440x900 and 1024x700): scroll region ends exactly at the bar's top, the last content row is fully visible, no document scroll or horizontal overflow. Screenshot `/tmp/t130-ui-fix-provisioning-scrolled.png`. Nothing saved or deployed.

**Secret scan**
- gitleaks `generic-api-key` matched a prose COMMENT in `utils/redact.ts` (a list of credential kinds — words, no value); the first push made `secret-scan` fail (run 36097741922). Fixed by exact fingerprints in a new `.gitleaksignore` (`2ec072b`, `65d8b1d`) + rewording the comment (`65d8b1d`, `f66034a`). `secret-scan` green on `f66034a` (run 36097937202).
- iotgw-kestra (PUBLIC) `main..task-130-provisioning-schema`: gitleaks clean + manual grep of every added line — only variable references and placeholders, no client values.

**Checks (monorepo branch)**
- Typecheck backend / app / supabase-contract OK; contract `tsdown` build OK.
- vitest: backend 16/16, app 22/22 (`pnpm exec vitest run`); app `vite build` OK.
- iotgw-kestra: `ansible-playbook --syntax-check` OK for `i11_provisioning_iotgw.yaml` and `d01_install_owrt.yml` in `cytopia/ansible:2.18-tools@sha256:da5e5a60…` (ansible-core 2.18.19, gekmihesg.openwrt @01fda612).
- Kestra `/flows/validate`: provisioning, install, connectivity-check → `constraints: null`, no warnings.

**Merges + pushes**
- Monorepo: `--no-ff` merge `0e7c888` into main (+ `f66034a` secret-scan follow-up); pushed to gitea and GitHub i40sys/iotgw-ng.
- iotgw-kestra: `--no-ff` merge `2cd5e9f` into main (branch already contained main's task-129 pins — runner image digest + role commit verified in Flow/install/connectivity-check); pushed `main` + `task-130-provisioning-schema` to GitHub i40sys/iotgw-kestra.

**Deploy**
- Kestra `iotgw-ng/provisioning` → **revision 8** (live source = Flow.yaml). `install` (rev 7) and `connectivity-check` (rev 8) unchanged by this task — not re-deployed.
- kind (`kind-iotgw`): `iotgw-ui-backend:local` / `iotgw-ui-frontend:local` rebuilt, loaded, rolled out (backend healthy, frontend serves the in-flow bar).
- `just dev` backend on :52174 restarted by `tsx watch` on the merged tree.

**CI (i40sys/iotgw-ng)**
- `0e7c888`: frontend-image 36097742123 success, backend-image 36097742126 success, secret-scan 36097741922 failure (fixed above).
- `f66034a`: secret-scan 36097937202 success, backend-image 36097937431 success.
- live-image not triggered (path filter `live-image/**`).

**Follow-ups (outside this task's ACs)**
- Lab-gateway provisioning re-run = task-129 AC#1 (another session). No flow or playbook was run against any gateway here.
- `files/stacks/uptime/env.j2` is client-specific and defaults two passwords to a shared literal in the PUBLIC repo; nodered not provisionable from the public repo; `firewall.j2` hard-codes ManagementIPs 10.2.0.47/32; rotate the client credentials the operator pasted.

**End-to-end on gw-c3 (2026-09-25) — provisioning SUCCESS**
- Preconditions: iotgw-kestra main 2cd5e9f (preflight + `-e @vars.json`) deployed to Kestra; monorepo main 0e7c888/f66034a; backend on :52174 running the validator.
- Config (deployment `764dbada…`, gw-c3): merged into `configuration`, keeping `osInstallation` and the legacy keys. Minimal set: `__tags__` [system, ntp, firewall, ssh_ca], `iotgw_hostname` iot-gw-c3, generated `root_password` (stored ONLY in the deployment JSON, user decision), `local_ip_address`/`main_local_dns` 10.254.253.1 (gw-c3's existing br-lan), `local_domain` lan, `primary_ntp` 0.openwrt.pool.ntp.org, firewall on with empty allow lists, every other stack flag false.
- Validated with `validateDeploymentConfigStep` (os-installation + provisioning: 0 issues), saved via tRPC `updateDeployment`, run via `executeKestraDeployment`.
- Kestra exec `3Y2EmW9i3tFNGyBirESW3Y` **SUCCESS**: preflight → stacks [system, ntp, firewall]; wg0 read back + asserted; network/firewall backed up to `/root/.iotgw-provisioning-backup/`; ssh_ca idempotent (valid host cert already installed → no re-enroll; cert + break-glass assert OK). RECAP ok=68 changed=26 failed=0.

**Verified on the gateway (read-only)**
- `iotgw vpn status` HEALTHY (handshake fresh, endpoint 216.45.62.117:443); `iotgw ssh status` User CA / Host CA / Host identity / sshd all HEALTHY.
- `network.iotgw_endpoint` route present again (the template drops it; the agent re-added it, decision-032 §9).
- hostname `iot-gw-c3` (kernel + uci); `system.ntp.server` 0.openwrt.pool.ntp.org.
- Firewall: `vpn` zone (wg0) kept; wan input REJECT; the `SSH allowed` rule keeps port 22 open.
- Kestra connectivity-check exec `5SXe1DENOGpKpdKpmhWwf2` SUCCESS (20 s).

**Observations / follow-ups**
- network.j2 still hard-codes the lan netmask: gw-c3 went from /24 to **/26** (10.254.253.1/26). Harmless here (br-lan unused), but on a gateway whose LAN hosts sit above .63 it would cut them off. Make the netmask (or CIDR) a schema field.
- deployment_jobs row stayed RUNNING until the first read (reconcile-on-read, 9419298) — works as designed, but a job nobody opens stays RUNNING in the DB.
<!-- SECTION:NOTES:END -->
