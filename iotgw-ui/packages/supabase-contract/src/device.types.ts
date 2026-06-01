/**
 * Represents a device in the IoT Gateway system
 */
export type Device = {
  id: string;
  hostname: string;
  ip_address: string | null;
  mac_address: string | null;
  os: string | null;
  status: DeviceStatus;
  last_seen_at: string;
  created_at: string;
};

/**
 * Valid status values for a device
 */
export type DeviceStatus = "online" | "offline" | "maintenance" | "unknown";

/**
 * Input for GetDevices RPC function
 */
export type GetDevicesInput = {
  limit_param?: number;
  offset_param?: number;
};

/**
 * Input for adding a new device
 */
export type AddDeviceInput = {
  hostname: string;
  ip_address?: string | null;
  mac_address?: string | null;
  os?: string | null;
  status?: DeviceStatus;
};

/**
 * Input for updating a device's status
 */
export type UpdateDeviceStatusInput = {
  device_id: string;
  status: DeviceStatus;
};
