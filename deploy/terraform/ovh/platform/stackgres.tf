# The supabase-db overlay component is an SGCluster: the operator (and its CRDs)
# must exist before the overlay is applied.
resource "helm_release" "stackgres" {
  name             = "stackgres-operator"
  namespace        = "stackgres"
  create_namespace = true
  repository       = "https://stackgres.io/downloads/stackgres-k8s/stackgres/helm/"
  chart            = "stackgres-operator"
  version          = var.stackgres_version
  wait             = true
  timeout          = 600
}
