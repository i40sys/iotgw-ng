# The control plane already exists (free plan, GRA9, also serves hl.joor.net via
# Traefik). Terraform adopts it instead of creating one, and must never destroy it.
import {
  to = ovh_cloud_project_kube.ymbihq
  id = "${var.service_name}/${var.kube_id}"
}

resource "ovh_cloud_project_kube" "ymbihq" {
  service_name  = var.service_name
  name          = "ymbihq"
  region        = "GRA9"
  update_policy = "ALWAYS_UPDATE"

  lifecycle {
    prevent_destroy = true
    # OVH rolls minor/patch versions itself (ALWAYS_UPDATE).
    ignore_changes = [version]
  }
}

resource "ovh_cloud_project_kube_nodepool" "iotgw" {
  service_name   = var.service_name
  kube_id        = ovh_cloud_project_kube.ymbihq.id
  name           = "iotgw"
  flavor_name    = var.nodepool_flavor
  desired_nodes  = var.nodepool_size
  min_nodes      = var.nodepool_size
  max_nodes      = var.nodepool_size
  autoscale      = false
  monthly_billed = false
  anti_affinity  = false

  template {
    metadata {
      labels = {
        "iotgw.i40sys.com/pool" = "iotgw"
      }
      annotations = {}
      finalizers  = []
    }
    spec {
      unschedulable = false
      taints        = []
    }
  }
}
