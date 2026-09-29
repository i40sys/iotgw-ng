terraform {
  required_version = ">= 1.9"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.38"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.0"
    }
    kustomization = {
      source  = "kbst/kustomization"
      version = "~> 0.9"
    }
    sops = {
      source  = "carlpett/sops"
      version = "~> 1.2"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Same bucket as infra/. NOTE: this state holds the k8s Secrets' plaintext
  # (sops-decrypted) — the bucket is private to the OVH project.
  backend "s3" {
    bucket                      = "iotgw-ng-tfstate-28f191"
    key                         = "ovh/platform.tfstate"
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

# The cluster credentials come from the infra state (the imported ymbihq cluster).
data "terraform_remote_state" "infra" {
  backend = "s3"
  config = {
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
  }
}

locals {
  kube = data.terraform_remote_state.infra.outputs.kubeconfig_attributes[0]
}

provider "kubernetes" {
  host                   = local.kube.host
  cluster_ca_certificate = base64decode(local.kube.cluster_ca_certificate)
  client_certificate     = base64decode(local.kube.client_certificate)
  client_key             = base64decode(local.kube.client_key)
}

provider "helm" {
  kubernetes = {
    host                   = local.kube.host
    cluster_ca_certificate = base64decode(local.kube.cluster_ca_certificate)
    client_certificate     = base64decode(local.kube.client_certificate)
    client_key             = base64decode(local.kube.client_key)
  }
}

provider "kustomization" {
  kubeconfig_raw = data.terraform_remote_state.infra.outputs.kubeconfig
}
