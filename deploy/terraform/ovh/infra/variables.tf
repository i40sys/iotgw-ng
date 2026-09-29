variable "service_name" {
  description = "OVH Public Cloud project id"
  type        = string
  default     = "28f191dfa5eb430c8e9928711016fbed"
}

variable "kube_id" {
  description = "Existing OVH Managed Kubernetes cluster (ymbihq, GRA9) — imported, not created"
  type        = string
  default     = "07ae71cb-64c0-45ae-8d65-1b2910b7f37f"
}

variable "nodepool_flavor" {
  description = "Worker flavor: iotgw-ng is memory-bound (~3 GiB steady, 5-6 GiB peaks), CPU-light"
  type        = string
  default     = "r3-16"
}

variable "nodepool_size" {
  type    = number
  default = 1
}
