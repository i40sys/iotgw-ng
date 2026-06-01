#!/usr/bin/python
# -*- coding: utf-8 -*-

# Copyright: (c) 2025, Oriol
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)

from __future__ import absolute_import, division, print_function
__metaclass__ = type

DOCUMENTATION = r'''
---
module: netmaker_management
short_description: Manage Netmaker networks and external client devices
version_added: "2.1.0"
description:
    - Create, update, or delete Netmaker networks and external client devices via the API
    - Supports idempotent operations
    - Requires either master_key or username/password for authentication
    - External clients are WireGuard devices that connect to networks without running netclient
author:
    - "Oriol Rius (@oriolrius)"
options:
    resource_type:
        description:
            - Type of resource to manage
        required: true
        type: str
        choices: ['network', 'extclient']
    name:
        description:
            - Name/ID of the resource
            - For networks: the network ID (netid)
            - For extclients: the client ID (device name)
        required: true
        type: str
    network:
        description:
            - Network ID for the external client
            - Only required when resource_type is 'extclient'
        required: false
        type: str
    ingress_gateway_id:
        description:
            - Ingress gateway node ID for external clients
            - Required when creating extclient
            - Can be set to 'auto' to automatically find the first ingress gateway
        required: false
        type: str
    state:
        description:
            - Desired state of the resource
        choices: ['present', 'absent']
        default: 'present'
        type: str
    base_url:
        description:
            - Base URL of the Netmaker API server
        required: true
        type: str
    master_key:
        description:
            - Master key for authentication (preferred method)
            - If not provided, username and password will be used
        required: false
        type: str
    username:
        description:
            - Username for authentication
            - Only used if master_key is not provided
        required: false
        type: str
        default: 'oriol'
    password:
        description:
            - Password for authentication
            - Only used if master_key is not provided
        required: false
        type: str
        no_log: true
    validate_certs:
        description:
            - Validate SSL certificates
        required: false
        type: bool
        default: true
    # Network-specific options
    addressrange:
        description:
            - IPv4 address range for the network (CIDR notation)
            - Only applicable when resource_type is 'network'
        required: false
        type: str
    addressrange6:
        description:
            - IPv6 address range for the network (CIDR notation)
            - Only applicable when resource_type is 'network'
        required: false
        type: str
    defaultextclientdns:
        description:
            - Default external client DNS
            - Only applicable when resource_type is 'network'
        required: false
        type: str
    defaultinterface:
        description:
            - Default network interface
            - Only applicable when resource_type is 'network'
        required: false
        type: str
    defaultpostdown:
        description:
            - Default post-down command
            - Only applicable when resource_type is 'network'
        required: false
        type: str
    defaultpostup:
        description:
            - Default post-up command
            - Only applicable when resource_type is 'network'
        required: false
        type: str
    defaultkeepalive:
        description:
            - Default keepalive interval in seconds
            - Only applicable when resource_type is 'network'
        required: false
        type: int
    defaultmtu:
        description:
            - Default MTU size
            - Only applicable when resource_type is 'network'
        required: false
        type: int
    islocal:
        description:
            - Whether the network is local
            - Only applicable when resource_type is 'network'
        required: false
        type: bool
        default: false
    # External client-specific options
    dns:
        description:
            - DNS server for the external client
            - Only applicable when resource_type is 'extclient'
        required: false
        type: str
    extraallowedips:
        description:
            - Additional allowed IPs for the external client
            - Only applicable when resource_type is 'extclient'
        required: false
        type: list
        elements: str
    enabled:
        description:
            - Whether the external client is enabled
            - Only applicable when resource_type is 'extclient'
        required: false
        type: bool
        default: true
    postup:
        description:
            - Post-up command for the external client
            - Only applicable when resource_type is 'extclient'
        required: false
        type: str
    postdown:
        description:
            - Post-down command for the external client
            - Only applicable when resource_type is 'extclient'
        required: false
        type: str
requirements:
    - python >= 3.6
    - requests
notes:
    - Either master_key or username/password must be provided
    - Master key authentication is recommended for automation
    - Network-specific parameters are only used when resource_type is 'network'
    - External client parameters are only used when resource_type is 'extclient'
    - External clients are WireGuard devices that get config files without running netclient
'''

EXAMPLES = r'''
# Create a network using master key
- name: Create Netmaker network
  netmaker_management:
    resource_type: network
    name: mynetwork
    state: present
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"
    addressrange: "10.10.10.0/24"
    defaultmtu: 1420

# Delete a network
- name: Delete Netmaker network
  netmaker_management:
    resource_type: network
    name: mynetwork
    state: absent
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"

# Create an external client device (WireGuard config)
- name: Create IoT device
  netmaker_management:
    resource_type: extclient
    name: sensor-01
    network: iot-network
    ingress_gateway_id: auto
    state: present
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"
    enabled: true

# Create external client with specific gateway
- name: Create device with specific gateway
  netmaker_management:
    resource_type: extclient
    name: device-02
    network: iot-network
    ingress_gateway_id: "bef77574-f11e-46cf-b1c1-98888a2189c4"
    state: present
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"

# Delete an external client
- name: Delete device
  netmaker_management:
    resource_type: extclient
    name: old-device
    network: iot-network
    state: absent
    base_url: https://api.netmaker.example.com
    master_key: "{{ netmaker_master_key }}"
'''

RETURN = r'''
resource:
    description: Resource information (network or external client)
    type: dict
    returned: when state is present
    sample: {
        "clientid": "sensor-01",
        "network": "iot-network",
        "address": "10.102.0.250",
        "publickey": "...",
        "enabled": true
    }
changed:
    description: Whether the resource was changed
    type: bool
    returned: always
msg:
    description: Human-readable message
    type: str
    returned: always
'''

import json
import traceback

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    REQUESTS_IMPORT_ERROR = traceback.format_exc()

from ansible.module_utils.basic import AnsibleModule, missing_required_lib


class NetmakerAPI:
    """Wrapper for Netmaker API operations"""

    def __init__(self, base_url, token, validate_certs=True):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.validate_certs = validate_certs
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def _request(self, method, endpoint, data=None):
        """Make an API request"""
        url = f"{self.base_url}/api{endpoint}"

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                verify=self.validate_certs
            )

            # Handle different response codes
            if response.status_code == 404:
                return None

            if response.status_code == 204:  # No content (successful delete)
                return True

            # Netmaker returns 500 with "no result found" when resource doesn't exist
            if response.status_code == 500:
                try:
                    error_data = response.json()
                    if error_data.get('Message') == 'no result found':
                        return None
                except:
                    pass

            response.raise_for_status()

            # Return JSON response if available
            if response.content:
                return response.json()
            return True

        except requests.exceptions.RequestException as e:
            error_msg = f"API request failed: {str(e)}"
            # Try to include response body if available
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_data = e.response.json()
                    if 'Message' in error_data:
                        error_msg += f" - {error_data['Message']}"
                except:
                    pass
            raise Exception(error_msg)

    def authenticate(self, username, password):
        """Authenticate with username/password and get token"""
        endpoint = "/users/adm/authenticate"
        data = {
            "username": username,
            "password": password
        }

        result = self._request("POST", endpoint, data)

        if not result or 'Response' not in result or 'AuthToken' not in result['Response']:
            raise Exception("Authentication failed: No token in response")

        return result['Response']['AuthToken']

    # Network API methods
    def get_network(self, network_id):
        """Get network by ID"""
        return self._request("GET", f"/networks/{network_id}")

    def create_network(self, network_data):
        """Create a new network"""
        return self._request("POST", "/networks", network_data)

    def update_network(self, network_id, network_data):
        """Update an existing network"""
        return self._request("PUT", f"/networks/{network_id}", network_data)

    def delete_network(self, network_id):
        """Delete a network"""
        return self._request("DELETE", f"/networks/{network_id}")

    # Node API methods (for finding ingress gateways)
    def list_nodes(self, network_id):
        """List nodes in a network"""
        return self._request("GET", f"/nodes/{network_id}")

    def find_ingress_gateway(self, network_id):
        """Find first ingress gateway in a network"""
        nodes = self.list_nodes(network_id)
        if not nodes:
            raise Exception(f"No nodes found in network '{network_id}'")

        for node in nodes:
            if node.get('isingressgateway') or node.get('is_gw'):
                return node['id']

        raise Exception(f"No ingress gateway found in network '{network_id}'")

    # External Client API methods
    def list_extclients(self, network_id):
        """List external clients for a network"""
        result = self._request("GET", f"/extclients/{network_id}")
        return result if result else []

    def get_extclient(self, network_id, client_id):
        """Get external client by ID"""
        clients = self.list_extclients(network_id)
        for client in clients:
            if client.get('clientid') == client_id:
                return client
        return None

    def create_extclient(self, network_id, gateway_id, client_data):
        """Create a new external client"""
        return self._request("POST", f"/extclients/{network_id}/{gateway_id}", client_data)

    def update_extclient(self, network_id, client_id, client_data):
        """Update an existing external client"""
        return self._request("PUT", f"/extclients/{network_id}/{client_id}", client_data)

    def delete_extclient(self, network_id, client_id):
        """Delete an external client"""
        return self._request("DELETE", f"/extclients/{network_id}/{client_id}")


def networks_equal(existing, desired):
    """Compare existing network with desired state (ignore read-only fields)"""
    comparable_fields = [
        'addressrange', 'addressrange6', 'defaultextclientdns',
        'defaultinterface', 'defaultpostdown', 'defaultpostup',
        'defaultkeepalive', 'defaultmtu'
    ]

    field_defaults = {
        'defaultpostdown': '',
        'defaultpostup': '',
    }

    for field in comparable_fields:
        if field in desired:
            if field not in existing and field not in field_defaults:
                continue

            existing_value = existing.get(field, field_defaults.get(field))
            desired_value = desired.get(field)

            # Handle boolean to yes/no string conversion
            if isinstance(desired_value, bool):
                if existing_value is None:
                    existing_value = field_defaults.get(field, False)
                existing_value_bool = existing_value in ['yes', 'true', True, 1]
                if existing_value_bool != desired_value:
                    return False
            # Handle empty string vs None
            elif desired_value == "" and existing_value in [None, ""]:
                continue
            elif existing_value != desired_value:
                return False

    return True


def extclients_equal(existing, desired):
    """Compare existing external client with desired state"""
    comparable_fields = ['dns', 'extraallowedips', 'enabled', 'postup', 'postdown']

    for field in comparable_fields:
        if field in desired:
            existing_value = existing.get(field)
            desired_value = desired.get(field)

            # Handle list comparison
            if isinstance(desired_value, list):
                if set(existing_value or []) != set(desired_value or []):
                    return False
            # Handle None vs empty string
            elif desired_value == "" and existing_value in [None, ""]:
                continue
            elif existing_value != desired_value:
                return False

    return True


def manage_network(module, api, name, state, network_data):
    """Manage network resources"""
    existing_network = api.get_network(name)

    result = {
        'changed': False,
        'resource': None,
        'msg': ''
    }

    if state == 'present':
        if existing_network:
            # Network exists - check if update is needed
            if networks_equal(existing_network, network_data):
                result['msg'] = f"Network '{name}' already exists with desired configuration"
                result['resource'] = existing_network
            else:
                # Update needed
                if module.check_mode:
                    result['changed'] = True
                    result['msg'] = f"Network '{name}' would be updated (check mode)"
                else:
                    # Start with existing network data and update with desired changes
                    update_data = existing_network.copy()
                    update_data.update(network_data)
                    updated_network = api.update_network(name, update_data)
                    result['changed'] = True
                    result['resource'] = updated_network
                    result['msg'] = f"Network '{name}' updated"
        else:
            # Network doesn't exist - create it
            if module.check_mode:
                result['changed'] = True
                result['msg'] = f"Network '{name}' would be created (check mode)"
            else:
                created_network = api.create_network(network_data)
                result['changed'] = True
                result['resource'] = created_network
                result['msg'] = f"Network '{name}' created"

    elif state == 'absent':
        if existing_network:
            # Network exists - delete it
            if module.check_mode:
                result['changed'] = True
                result['msg'] = f"Network '{name}' would be deleted (check mode)"
            else:
                api.delete_network(name)
                result['changed'] = True
                result['msg'] = f"Network '{name}' deleted"
        else:
            # Network doesn't exist - nothing to do
            result['msg'] = f"Network '{name}' does not exist"

    return result


def manage_extclient(module, api, name, network, ingress_gateway_id, state, client_data):
    """Manage external client (device) resources"""
    existing_client = api.get_extclient(network, name)

    result = {
        'changed': False,
        'resource': None,
        'msg': ''
    }

    if state == 'present':
        if existing_client:
            # Client exists - check if update is needed
            if extclients_equal(existing_client, client_data):
                result['msg'] = f"External client '{name}' already exists with desired configuration"
                result['resource'] = existing_client
            else:
                # Update needed
                if module.check_mode:
                    result['changed'] = True
                    result['msg'] = f"External client '{name}' would be updated (check mode)"
                else:
                    # Start with existing client data and update with desired changes
                    update_data = existing_client.copy()
                    update_data.update(client_data)
                    updated_client = api.update_extclient(network, name, update_data)
                    result['changed'] = True
                    result['resource'] = updated_client
                    result['msg'] = f"External client '{name}' updated"
        else:
            # Client doesn't exist - create it
            if module.check_mode:
                result['changed'] = True
                result['msg'] = f"External client '{name}' would be created (check mode)"
            else:
                # Resolve gateway ID if 'auto'
                gateway_id = ingress_gateway_id
                if gateway_id == 'auto':
                    gateway_id = api.find_ingress_gateway(network)

                created_client = api.create_extclient(network, gateway_id, client_data)
                result['changed'] = True
                result['resource'] = created_client
                result['msg'] = f"External client '{name}' created"

    elif state == 'absent':
        if existing_client:
            # Client exists - delete it
            if module.check_mode:
                result['changed'] = True
                result['msg'] = f"External client '{name}' would be deleted (check mode)"
            else:
                api.delete_extclient(network, name)
                result['changed'] = True
                result['msg'] = f"External client '{name}' deleted"
        else:
            # Client doesn't exist - nothing to do
            result['msg'] = f"External client '{name}' does not exist"

    return result


def main():
    # Define network-specific parameters
    network_params = [
        'addressrange', 'addressrange6', 'defaultextclientdns',
        'defaultinterface', 'defaultpostdown', 'defaultpostup',
        'defaultkeepalive', 'defaultmtu', 'islocal'
    ]

    # Define external client-specific parameters
    extclient_params = [
        'dns', 'extraallowedips', 'enabled', 'postup', 'postdown'
    ]

    module = AnsibleModule(
        argument_spec=dict(
            resource_type=dict(type='str', required=True, choices=['network', 'extclient']),
            name=dict(type='str', required=True),
            network=dict(type='str', required=False),
            ingress_gateway_id=dict(type='str', required=False, default='auto'),
            state=dict(type='str', default='present', choices=['present', 'absent']),
            base_url=dict(type='str', required=True),
            master_key=dict(type='str', required=False, no_log=True),
            username=dict(type='str', required=False, default='oriol'),
            password=dict(type='str', required=False, no_log=True),
            validate_certs=dict(type='bool', required=False, default=True),
            # Network-specific options
            addressrange=dict(type='str', required=False),
            addressrange6=dict(type='str', required=False),
            defaultextclientdns=dict(type='str', required=False),
            defaultinterface=dict(type='str', required=False),
            defaultpostdown=dict(type='str', required=False),
            defaultpostup=dict(type='str', required=False),
            defaultkeepalive=dict(type='int', required=False),
            defaultmtu=dict(type='int', required=False),
            islocal=dict(type='bool', required=False, default=False),
            # External client-specific options
            dns=dict(type='str', required=False),
            extraallowedips=dict(type='list', elements='str', required=False),
            enabled=dict(type='bool', required=False, default=True),
            postup=dict(type='str', required=False),
            postdown=dict(type='str', required=False),
        ),
        required_one_of=[
            ['master_key', 'password']
        ],
        required_if=[
            ['resource_type', 'extclient', ['network']],
        ],
        supports_check_mode=True
    )

    if not HAS_REQUESTS:
        module.fail_json(msg=missing_required_lib('requests'), exception=REQUESTS_IMPORT_ERROR)

    # Get parameters
    resource_type = module.params['resource_type']
    name = module.params['name']
    network = module.params.get('network')
    ingress_gateway_id = module.params.get('ingress_gateway_id')
    state = module.params['state']
    base_url = module.params['base_url']
    master_key = module.params.get('master_key')
    username = module.params.get('username')
    password = module.params.get('password')
    validate_certs = module.params['validate_certs']

    try:
        # Initialize API client
        if master_key:
            token = master_key
        else:
            # Authenticate to get token
            temp_api = NetmakerAPI(base_url, "", validate_certs)
            token = temp_api.authenticate(username, password)

        api = NetmakerAPI(base_url, token, validate_certs)

        # Handle different resource types
        if resource_type == 'network':
            # Build network data from parameters
            network_data = {'netid': name}
            for param in network_params:
                if module.params.get(param) is not None:
                    network_data[param] = module.params[param]

            result = manage_network(module, api, name, state, network_data)

        elif resource_type == 'extclient':
            # Build external client data from parameters
            client_data = {'clientid': name}
            for param in extclient_params:
                if module.params.get(param) is not None:
                    client_data[param] = module.params[param]

            result = manage_extclient(module, api, name, network, ingress_gateway_id, state, client_data)

        module.exit_json(**result)

    except Exception as e:
        module.fail_json(msg=f"Error managing Netmaker {resource_type}: {str(e)}")


if __name__ == '__main__':
    main()
