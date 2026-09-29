# Public names for iotgw-ng (task-142). They point at the cluster's existing
# Traefik LoadBalancer (created by the Traefik Service in ~/k8s, not by
# Terraform). DNS only: TLS terminates at Traefik, and the device host must
# present the device-API CA certificate the gateways pin (decision-035).
variable "cloudflare_zone_id" {
  description = "Cloudflare zone i40sys.com"
  type        = string
  default     = "ea42ac2ad4811a9a5533b390bceb3ff9"
}

variable "ingress_ip" {
  description = "Traefik LoadBalancer public IP on the ymbihq cluster"
  type        = string
  default     = "145.239.127.187"
}

locals {
  iotgw_hosts = ["iotgw", "backend.iotgw", "api.iotgw", "device.iotgw", "netboot.iotgw"]
}

resource "cloudflare_dns_record" "iotgw" {
  for_each = toset(local.iotgw_hosts)

  zone_id = var.cloudflare_zone_id
  name    = "${each.value}.i40sys.com"
  type    = "A"
  content = var.ingress_ip
  proxied = false
  ttl     = 300
  comment = "iotgw-ng on OVH MKS ymbihq (Terraform deploy/terraform/ovh/infra)"
}
