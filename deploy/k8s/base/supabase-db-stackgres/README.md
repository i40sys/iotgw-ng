# supabase-db-stackgres — StackGres-managed Postgres tier

The StackGres replacement for the hand-authored `../supabase-db` StatefulSet
(`decision-018`). Validated end-to-end on kind by `TASK-062.16` (spike) and
`TASK-056` (this tree, with the **real** `98-webhooks.sql`).

## Contents
- `instanceprofile-pgconfig.yaml` — `SGInstanceProfile` + `SGPostgresConfig`
  (`shared_preload_libraries` includes **pg_net** so its bgworker is live on
  first boot — no `SGDbOps` restart needed).
- `sgscript.yaml` — `SGScript` initdb: `00-roles.sql` (the supabase roles the
  vanilla StackGres image does not bake) → `98-webhooks.sql` (the **real** file,
  copied to `sql/`) → `90-secrets.sql` (from the `supabase-db-initdb` Secret).
- `sgcluster.yaml` — `SGCluster` named **`supabase-db`** (so its primary Service
  is `supabase-db`, matching the app tier's existing `supabase-db:5432`), PG15,
  `disableConnectionPooling: true` (direct primary; PgBouncer opt-in).
- `backup.yaml` — `SGObjectStorage` + `SGBackup` (PROD only; needs an S3/MinIO
  target; **not** in `kustomization.yaml`).
- `kustomization.yaml` — generates the `supabase-initdb-sql` ConfigMap from the
  SQL files (hash suffix disabled so the SGScript can name-reference it).

## Prerequisites (wired in `deploy/kind/bootstrap.sh`)
- StackGres operator installed (pinned **1.17.4** — 1.18.x is broken on k8s
  1.31; `TASK-062.16`). `bootstrap.sh up` installs it.
- `supabase-db-initdb` Secret (role passwords + jwt GUCs from the SOPS store).
  `bootstrap.sh secrets`/`deploy` generates it (`gen_initdb_secret`).

## Activation (the cutover) is NOT done here
This tree is authored + validated, but the base/overlays still deploy the
StatefulSet. Switching the overlay to this tree (and removing the StatefulSet +
its `patch-db-listen-all` / NodePort wiring) plus the data move is the **cutover**
— `TASK-062.04` (validate app tier against it) and `TASK-062.07` (superuser
dump/restore). The StatefulSet is retained as the NO-GO fallback.
