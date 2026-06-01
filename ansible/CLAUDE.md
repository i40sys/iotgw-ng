# ansible/ — Ansible Collections

This folder hosts Ansible collections authored for the iotgw-ng platform. Currently only one.

- **`netmaker/`** — the `oriolrius.netmaker` collection (published to Galaxy). Used by Kestra flows to manage WireGuard mesh networks and extclient devices via the Netmaker REST API. See [netmaker/CLAUDE.md](netmaker/CLAUDE.md).

## How it's consumed

Kestra flows install the collection at runtime:

```
ansible-galaxy collection install community.docker -p /etc/ansible/collections
# oriolrius.netmaker is referenced by FQCN in playbooks like
# kestra/data/main/iotgw-ng/_files/device_update.yml
```

When making changes here, remember playbooks in `kestra/` reference the published Galaxy version, not this local source. Either bump the collection version and publish (see `netmaker/CLAUDE.md` for the release flow) or use local `ansible.cfg` override for testing.
