output "kube_id" {
  value = ovh_cloud_project_kube.ymbihq.id
}

output "kubeconfig" {
  value     = ovh_cloud_project_kube.ymbihq.kubeconfig
  sensitive = true
}

output "kubeconfig_attributes" {
  value     = ovh_cloud_project_kube.ymbihq.kubeconfig_attributes
  sensitive = true
}
