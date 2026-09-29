# Per-namespace k8s Secrets from the SOPS store — the Terraform twin of
# deploy/kind/bootstrap.sh make_secrets (decision-014 / decision-020). Same
# values as kind: OVH is the migrated environment (task-142).
data "sops_file" "supabase" {
  source_file = "${path.module}/../../../../secrets/supabase.enc.env"
  input_type  = "dotenv"
}

data "sops_file" "kestra" {
  source_file = "${path.module}/../../../../secrets/kestra.enc.env"
  input_type  = "dotenv"
}

data "sops_file" "backend" {
  source_file = "${path.module}/../../../../secrets/iotgw-ui-backend.enc.env"
  input_type  = "dotenv"
}

data "sops_file" "device_api_tls" {
  source_file = "${path.module}/../../../../secrets/device-api-tls.enc.yaml"
}

locals {
  sb  = data.sops_file.supabase.data
  be  = data.sops_file.backend.data
  pw  = local.sb["POSTGRES_PASSWORD"]
  jwt = local.sb["JWT_SECRET"]
  exp = lookup(local.sb, "JWT_EXP", "3600")

  # name => { namespace, secret name, data }
  app_secrets = {
    "supabase-env/supabase-app" = { ns = "supabase-app", name = "supabase-env", data = local.sb }
    "supabase-env/iotgw-ui"     = { ns = "iotgw-ui", name = "supabase-env", data = local.sb }
    "kestra-env/kestra"         = { ns = "kestra", name = "kestra-env", data = data.sops_file.kestra.data }
    "kestra-env/iotgw-ui"       = { ns = "iotgw-ui", name = "kestra-env", data = data.sops_file.kestra.data }
    "kms-auth/iotgw-ui"         = { ns = "iotgw-ui", name = "kms-auth", data = { KMS_AUTH_TOKEN = local.be["KMS_AUTH_TOKEN"] } }
    "kms-auth/kestra"           = { ns = "kestra", name = "kms-auth", data = { KMS_AUTH_TOKEN = local.be["KMS_AUTH_TOKEN"] } }
    "pki-oidc/iotgw-ui"         = { ns = "iotgw-ui", name = "pki-oidc", data = { PKI_OIDC_CLIENT_SECRET = local.be["PKI_OIDC_CLIENT_SECRET"] } }
    "supabase-anon/kestra"      = { ns = "kestra", name = "supabase-anon", data = { ANON_KEY = local.sb["ANON_KEY"] } }
    "ops-cert-mint/iotgw-ui"    = { ns = "iotgw-ui", name = "ops-cert-mint", data = { OPS_CERT_MINT_TOKEN = local.be["OPS_CERT_MINT_TOKEN"] } }
    "ops-cert-mint/kestra"      = { ns = "kestra", name = "ops-cert-mint", data = { OPS_CERT_MINT_TOKEN = local.be["OPS_CERT_MINT_TOKEN"] } }
    "device-auth/iotgw-ui"      = { ns = "iotgw-ui", name = "device-auth", data = { DEVICE_AUTH_TOKEN = local.be["DEVICE_AUTH_TOKEN"] } }
    "device-auth/supabase-app"  = { ns = "supabase-app", name = "device-auth", data = { DEVICE_AUTH_TOKEN = local.be["DEVICE_AUTH_TOKEN"] } }
    # StackGres SGScript 90-secrets + the authenticator password StackGres owns.
    "supabase-db-initdb/supabase-db" = {
      ns   = "supabase-db"
      name = "supabase-db-initdb"
      data = {
        "90-secrets.sql" = <<-SQL
          ALTER ROLE authenticator             WITH PASSWORD '${local.pw}';
          ALTER ROLE supabase_admin            WITH PASSWORD '${local.pw}';
          ALTER ROLE supabase_auth_admin       WITH PASSWORD '${local.pw}';
          ALTER ROLE supabase_storage_admin    WITH PASSWORD '${local.pw}';
          ALTER ROLE supabase_functions_admin  WITH PASSWORD '${local.pw}';
          ALTER ROLE pgbouncer                 WITH PASSWORD '${local.pw}';
          ALTER DATABASE postgres SET "app.settings.jwt_secret" TO '${local.jwt}';
          ALTER DATABASE postgres SET "app.settings.jwt_exp"    TO '${local.exp}';
        SQL
      }
    }
    "supabase-db-credentials/supabase-db" = { ns = "supabase-db", name = "supabase-db-credentials", data = { "authenticator-password" = local.pw } }
  }
}

resource "kubernetes_secret_v1" "app" {
  for_each = local.app_secrets

  metadata {
    name      = each.value.name
    namespace = each.value.ns
  }
  data = each.value.data

  depends_on = [kustomization_resource.p0]
}

# Device-API server certificate for the public hostname, signed by the SAME
# device-API CA the gateways already pin (decision-035) — no gateway re-trust.
resource "tls_private_key" "device_api" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "tls_cert_request" "device_api" {
  private_key_pem = tls_private_key.device_api.private_key_pem
  dns_names       = [var.device_api_host]
  subject {
    organization = "iotgw-ng"
    common_name  = var.device_api_host
  }
}

resource "tls_locally_signed_cert" "device_api" {
  cert_request_pem      = tls_cert_request.device_api.cert_request_pem
  ca_private_key_pem    = data.sops_file.device_api_tls.data["ca_key"]
  ca_cert_pem           = data.sops_file.device_api_tls.data["ca_crt"]
  validity_period_hours = 24 * 365 * 2
  early_renewal_hours   = 24 * 30
  allowed_uses          = ["digital_signature", "key_encipherment", "server_auth"]
}

resource "kubernetes_secret_v1" "device_api_tls" {
  metadata {
    name      = "device-api-tls"
    namespace = "iotgw-gateway"
  }
  type = "kubernetes.io/tls"
  data = {
    "tls.crt" = "${tls_locally_signed_cert.device_api.cert_pem}${data.sops_file.device_api_tls.data["ca_crt"]}"
    "tls.key" = tls_private_key.device_api.private_key_pem
  }

  depends_on = [kustomization_resource.p0]
}
