terraform {
  required_version = ">= 1.9"

  required_providers {
    ovh = {
      source  = "ovh/ovh"
      version = "~> 2.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # OVH Object Storage (S3, GRA). Bucket + user are bootstrapped once outside
  # Terraform; credentials come from secrets/ovh.enc.env via tf.sh.
  backend "s3" {
    bucket                      = "iotgw-ng-tfstate-28f191"
    key                         = "ovh/infra.tfstate"
    region                      = "gra"
    endpoints                   = { s3 = "https://s3.gra.io.cloud.ovh.net" }
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true
  }
}

# Endpoint/keys from OVH_* env vars (tf.sh).
provider "ovh" {}

# CLOUDFLARE_API_TOKEN (Zone:DNS:Edit on i40sys.com) from tf.sh.
provider "cloudflare" {}
