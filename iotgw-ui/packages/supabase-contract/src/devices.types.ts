import type { Tables } from "./database.types";

export type Device = Tables<"devices">;

export type DeviceWithNetwork = Device & {
  network?: Tables<"networks">;
};

export interface CreateDeviceInput {
  network_id: string;
  name: string;
  description?: string;
  ip_address: string;
  private_key?: string;
  public_key?: string;
}

export interface UpdateDeviceInput {
  id: string;
  network_id?: string;
  name?: string;
  description?: string;
  ip_address?: string;
  private_key?: string;
  public_key?: string;
}

export interface DeviceFilters {
  network_id?: string;
  name?: string;
  ip_address?: string;
}
