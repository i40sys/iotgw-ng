#!/usr/bin/env python3
"""Declare release components and record a read-only Kubernetes image snapshot.

Dependencies: Python 3 + PyYAML, git and kubectl. Never applies cluster changes.
Only allowlisted identity fields reach the output; env, Secrets and pod logs do not.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys

import yaml

ROOT = Path(__file__).resolve().parent.parent
RELEASE = re.compile(r"^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")
CUSTOM = {
    "iotgw-ui-frontend": ("frontend", "User interface", "iotgw-ui/apps/app/package.json"),
    "iotgw-ui-backend": ("backend", "Backend API", "iotgw-ui/apps/backend/package.json"),
    "functions": ("functions", "Edge functions", None),
}


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True, stderr=subprocess.PIPE, timeout=60).strip()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def component(component_id, name, *, version=None, revision=None, image=None, workload=None):
    return dict(id=component_id, name=name, version=version, revision=revision,
                image=image, workload=workload, observation=None)


def image_version(image):
    # Digest-only references do not reveal the upstream package version.
    if "@" in image:
        return None
    return image.rsplit("/", 1)[-1].split(":", 1)[1] if ":" in image.rsplit("/", 1)[-1] else None


def declared_components(documents, revision, package_versions):
    result = []
    for document in documents:
        if not isinstance(document, dict):
            continue
        kind = document.get("kind")
        metadata = document.get("metadata", {})
        namespace, name = metadata.get("namespace", "default"), metadata.get("name", "")
        if kind == "SGCluster":
            result.append(component(f"{namespace}/{name}", "PostgreSQL (StackGres)",
                                    version=str(document["spec"]["postgres"]["version"])))
        if kind not in ("Deployment", "StatefulSet"):
            continue
        for container in document["spec"]["template"]["spec"].get("containers", []):
            image = container["image"]
            identity = CUSTOM.get(name) if namespace in ("iotgw-ui", "supabase-app") else None
            component_id = identity[0] if identity else f"{namespace}/{name}/{container['name']}"
            display_name = identity[1] if identity else {"kestra": "Kestra engine", "cosmian-kms": "Cosmian KMS"}.get(name, name)
            result.append(component(
                component_id, display_name,
                version=package_versions.get(component_id) if identity else image_version(image),
                revision=revision if identity else None, image=image,
                workload=dict(kind=kind, namespace=namespace, name=name, container=container["name"]),
            ))
    ids = [entry["id"] for entry in result]
    if len(ids) != len(set(ids)) or not {"frontend", "backend"}.issubset(ids):
        raise ValueError("Overlay must declare one frontend and one backend, with unique component identities")
    return result


def generate(args):
    if not RELEASE.fullmatch(args.release):
        raise ValueError("Release must be an exact vX.Y.Z tag (optional prerelease/build suffix)")
    revision = run("git", "rev-parse", "--verify", f"refs/tags/{args.release}^{{commit}}")
    package_versions = {
        identity[0]: json.loads(run("git", "show", f"{revision}:{identity[2]}"))["version"]
        for identity in CUSTOM.values() if identity[2]
    }
    documents = list(yaml.safe_load_all(run("kubectl", "kustomize", str(args.overlay))))
    components = declared_components(documents, revision, package_versions)
    components.append(component("kestra-flows", "Kestra workflows", revision=args.flows_revision))
    migration_files = run("git", "ls-tree", "-r", "--name-only", revision, "iotgw-ui/supabase/migrations").splitlines()
    migrations = sorted(Path(path).name for path in migration_files if path.endswith(".sql"))
    components.append(component("database-migrations", "Database migration target",
                                version=migrations[-1] if migrations else None, revision=revision))
    return dict(schemaVersion=1, product="Edge Manager", release=args.release,
                environment=args.environment, createdAt=now(), components=components)


def observe(workload, resource, pods, checked_at):
    """All active replicas must be current and ready; an old pod is a mismatch."""
    spec, status = resource["spec"], resource.get("status", {})
    replicas = spec.get("replicas", 1)
    active = [pod for pod in pods if not pod.get("metadata", {}).get("deletionTimestamp")]
    ready = (replicas > 0 and len(active) == replicas
             and status.get("observedGeneration", 0) >= resource["metadata"].get("generation", 1)
             and status.get("readyReplicas", 0) == replicas
             and status.get("updatedReplicas", 0) == replicas)
    images, image_ids = [], []
    # Include the desired template as well as running replicas.
    for container in spec["template"]["spec"]["containers"]:
        if container["name"] == workload["container"]:
            images.append(container["image"])
    for pod in active:
        container = next((entry for entry in pod["spec"]["containers"] if entry["name"] == workload["container"]), None)
        current = next((entry for entry in pod.get("status", {}).get("containerStatuses", []) if entry["name"] == workload["container"]), None)
        if not container or not current:
            ready = False
            continue
        images.append(container["image"])
        ready = ready and current.get("ready", False) and pod.get("status", {}).get("phase") == "Running"
        if current.get("imageID"):
            image_ids.append(current["imageID"])
    return dict(checkedAt=checked_at, images=sorted(set(images)), imageIds=sorted(set(image_ids)), ready=ready)


def verify(args):
    manifest = read_declaration(args.manifest)
    checked_at, failures = now(), []
    # A kubectl context is required explicitly to prevent checking the wrong cluster.
    kubectl = ["kubectl", "--context", args.context]
    for entry in manifest["components"]:
        workload = entry.get("workload")
        if not workload:
            continue
        resource = json.loads(run(*kubectl, "-n", workload["namespace"], "get", workload["kind"], workload["name"], "-o", "json"))
        selector = resource["spec"]["selector"]
        if selector.get("matchExpressions"):
            raise ValueError("Expression selectors are not supported by this snapshot tool")
        labels = selector.get("matchLabels", {})
        if not labels:
            raise ValueError("Refusing to inspect pods without a workload label selector")
        pods = json.loads(run(*kubectl, "-n", workload["namespace"], "get", "pods", "-l",
                              ",".join(f"{key}={value}" for key, value in labels.items()), "-o", "json"))["items"]
        entry["observation"] = observe(workload, resource, pods, checked_at)
        if not entry["observation"]["ready"] or any(image != entry["image"] for image in entry["observation"]["images"]):
            failures.append(entry["id"])
    return manifest, failures


def read_declaration(path):
    """Reconstruct the public contract, discarding any extra data in input files."""
    if path.stat().st_size > 256 * 1024:
        raise ValueError("Release metadata exceeds 256 KiB")
    value = json.loads(path.read_text())
    if (not isinstance(value, dict) or value.get("schemaVersion") != 1
            or value.get("product") != "Edge Manager"
            or not RELEASE.fullmatch(value.get("release", ""))
            or value.get("environment") not in ("development", "test", "staging", "production")):
        raise ValueError("Invalid release declaration")
    components = []
    for entry in value["components"]:
        workload = entry.get("workload")
        if workload:
            workload = {key: workload[key] for key in ("kind", "namespace", "name", "container")}
            if workload["kind"] not in ("Deployment", "StatefulSet"):
                raise ValueError("Unsupported workload")
        components.append(component(entry["id"], entry["name"], version=entry.get("version"),
                                    revision=entry.get("revision"), image=entry.get("image"), workload=workload))
    ids = [entry["id"] for entry in components]
    if len(ids) != len(set(ids)) or not {"frontend", "backend"}.issubset(ids):
        raise ValueError("Missing or repeated component identity")
    return dict(schemaVersion=1, product="Edge Manager", release=value["release"],
                environment=value["environment"], createdAt=value["createdAt"], components=components)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("generate", help="Create a declaration from a Git release tag and rendered overlay")
    create.add_argument("--release", required=True)
    create.add_argument("--overlay", type=Path, required=True)
    create.add_argument("--environment", choices=["development", "test", "staging", "production"], required=True)
    create.add_argument("--flows-revision", help="Declared immutable revision of the separate iotgw-kestra repository")
    create.add_argument("--output", type=Path, required=True)
    check = commands.add_parser("verify", help="Read cluster image references/readiness and record a timestamped snapshot")
    check.add_argument("--manifest", type=Path, required=True)
    check.add_argument("--context", required=True)
    check.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if getattr(args, "flows_revision", None) and not re.fullmatch(r"[a-f0-9]{40,64}", args.flows_revision):
            raise ValueError("Workflow revision must be a full Git commit SHA")
        value, failures = (generate(args), []) if args.command == "generate" else verify(args)
        # Serialize only the deliberately selected metadata above, never the k8s documents.
        temporary = args.output.with_suffix(args.output.suffix + ".tmp")
        temporary.write_text(json.dumps(value, indent=2) + "\n")
        temporary.replace(args.output)
        print(f"Wrote {args.output}")
        if failures:
            print("Image reference/readiness mismatches: " + ", ".join(failures), file=sys.stderr)
            return 1
        return 0
    except (ValueError, TypeError, KeyError, OSError, subprocess.SubprocessError, yaml.YAMLError):
        # Do not echo rendered manifests, environment variables or kubectl output.
        print("Could not generate/check metadata. Check the release tag, overlay, context and manifest fields.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
