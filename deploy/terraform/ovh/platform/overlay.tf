# deploy/k8s/overlays/ovh applied in three waves so CRD-backed objects and
# workloads find their namespaces / CRDs / Secrets already present.
data "kustomization_build" "ovh" {
  path = "${path.module}/../../../k8s/overlays/ovh"
}

resource "kustomization_resource" "p0" {
  for_each = data.kustomization_build.ovh.ids_prio[0]
  manifest = data.kustomization_build.ovh.manifests[each.value]

  depends_on = [helm_release.stackgres]
}

resource "kustomization_resource" "p1" {
  for_each = data.kustomization_build.ovh.ids_prio[1]
  manifest = (
    contains(["_/Secret"], regex("(?P<group_kind>.*/.*)/.*/.*", each.value)["group_kind"])
    ? sensitive(data.kustomization_build.ovh.manifests[each.value])
    : data.kustomization_build.ovh.manifests[each.value]
  )
  # No rollout wait: several workloads only turn healthy after the kind data
  # migration (KMS token key, app schema) — verified by the smoke instead.

  depends_on = [kustomization_resource.p0, kubernetes_secret_v1.app]
}

resource "kustomization_resource" "p2" {
  for_each = data.kustomization_build.ovh.ids_prio[2]
  manifest = data.kustomization_build.ovh.manifests[each.value]

  depends_on = [kustomization_resource.p1]
}
