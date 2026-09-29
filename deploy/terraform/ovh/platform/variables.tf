variable "stackgres_version" {
  # kind pins 1.17.4 (deploy/kind/bootstrap.sh), whose chart stops at k8s 1.34;
  # OVH runs 1.35, so this cluster needs 1.19.x (k8s 1.25-1.37).
  description = "StackGres operator chart version"
  type        = string
  default     = "1.19.1"
}

variable "device_api_host" {
  description = "Public device-API hostname; must be in the cert SAN the gateways verify"
  type        = string
  default     = "device.iotgw.i40sys.com"
}
