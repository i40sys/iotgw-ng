import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

spec = importlib.util.spec_from_file_location("release_manifest", Path(__file__).with_name("release-manifest.py"))
release_manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_manifest)


class ReleaseManifestTests(unittest.TestCase):
    def test_generation_only_copies_image_identity_not_secrets(self):
        documents = []
        for name in ("iotgw-ui-frontend", "iotgw-ui-backend"):
            documents.append({"kind": "Deployment", "metadata": {"name": name, "namespace": "iotgw-ui"},
                              "spec": {"template": {"spec": {"containers": [{"name": name, "image": f"example/{name}:v1", "env": [{"name": "TOKEN", "value": "secret"}]}]}}}})
        components = release_manifest.declared_components(documents, "a" * 40, {"frontend": "0.1.0", "backend": "1.0.0"})
        self.assertEqual([entry["id"] for entry in components], ["frontend", "backend"])
        self.assertNotIn("secret", str(components))
        self.assertNotIn("env", str(components))

    def test_partial_rollout_is_not_recorded_as_ready(self):
        workload = {"container": "backend"}
        resource = {"metadata": {"generation": 3}, "spec": {"replicas": 2, "template": {"spec": {"containers": [{"name": "backend", "image": "new"}]}}},
                    "status": {"observedGeneration": 3, "readyReplicas": 2, "updatedReplicas": 1}}
        def pod(image):
            return {"spec": {"containers": [{"name": "backend", "image": image}]}, "status": {"phase": "Running", "containerStatuses": [{"name": "backend", "ready": True, "imageID": "sha256:opaque"}]}}
        snapshot = release_manifest.observe(workload, resource, [pod("old"), pod("new")], "2026-09-29T10:00:00Z")
        self.assertFalse(snapshot["ready"])
        self.assertEqual(snapshot["images"], ["new", "old"])
        resource["status"]["updatedReplicas"] = 2
        self.assertTrue(release_manifest.observe(workload, resource, [pod("new"), pod("new")], "now")["ready"])
        self.assertFalse(release_manifest.observe(workload, resource, [pod("new")], "now")["ready"])

    def test_digest_references_do_not_invent_an_upstream_version(self):
        self.assertEqual(release_manifest.image_version("registry.example:5000/kestra:v1.2.3"), "v1.2.3")
        self.assertIsNone(release_manifest.image_version("registry.example:5000/kestra@sha256:" + "a" * 64))

    def test_verification_input_drops_undeclared_fields_and_old_observations(self):
        value = dict(schemaVersion=1, product="Edge Manager", release="v1.2.3", environment="production",
                     createdAt="2026-09-29T10:00:00Z", secret="must-not-be-copied",
                     components=[dict(release_manifest.component(name, name), env={"PASSWORD": "must-not-be-copied"},
                                      observation={"ready": True}) for name in ("frontend", "backend")])
        with TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(value))
            result = release_manifest.read_declaration(path)
        self.assertNotIn("must-not-be-copied", json.dumps(result))
        self.assertTrue(all(entry["observation"] is None for entry in result["components"]))


if __name__ == "__main__":
    unittest.main()
