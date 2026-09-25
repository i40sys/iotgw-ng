import { describe, it, expect, vi, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../router";
import { logger } from "../../logger";
import { redactForLog } from "../../utils/redact";
import example from "../../../../../packages/supabase-contract/src/deployment-config.example.json";

// task-130: executeKestraDeployment validates the provisioning part of the
// configuration against the deployment-config JSON Schema before Kestra runs.

vi.mock("../../services/kms", () => ({
  ensureDeviceSshKey: vi.fn(),
  deviceSshKeyId: (id: string) => `device_ssh_${id}`,
}));

const SECRET = "s3cret-DO-NOT-LOG";

// The committed example with every CHANGE_ME placeholder filled in.
const validConfig = (): Record<string, any> => {
  const config = structuredClone(example) as Record<string, any>;
  for (const [key, value] of Object.entries(config)) {
    if (value === "CHANGE_ME") config[key] = SECRET;
  }
  config.users = [{ username: "hmi", password: SECRET }];
  return config;
};

const single = (data: unknown) => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data, error: null })),
  };
  return builder;
};

const createSupabaseMock = (configuration: unknown) => {
  const tables: Record<string, any> = {
    devices: single({
      id: "device-1",
      name: "gw-1",
      description: "",
      ip_address: "10.0.0.10",
      network_id: "network-1",
      ssh_key_id: "ssh-key-1",
      totp_counter: 0,
    }),
    networks: single({
      id: "network-1",
      name: "Network One",
      ipv4_cidr: "10.0.0.0/24",
      ipv6_cidr: null,
      domain_id: "domain-1",
    }),
    domains: single({ id: "domain-1", name: "example", display_name: "Ex" }),
    deployments: single({
      id: "deployment-1",
      name: "Deployment One",
      version: "1",
      configuration,
    }),
  };
  return {
    from: vi.fn((table: string) => tables[table]),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
};

const run = (
  configuration: unknown,
  flow_type: "install" | "provisioning" = "provisioning",
) => {
  const supabase = createSupabaseMock(configuration);
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ id: "exec-1", flowId: `iotgw-ng/${flow_type}` }),
  }));
  vi.stubGlobal("fetch", fetchMock as any);
  const caller = appRouter.createCaller({
    supabase: supabase as any,
    req: {} as any,
    res: {} as any,
    user: { name: "test" },
  } as any);
  const promise = caller.executeKestraDeployment({
    device_id: "device-1",
    deployment_id: "deployment-1",
    flow_type,
  });
  return { promise, fetchMock, supabase };
};

describe("executeKestraDeployment — provisioning config validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts a complete provisioning configuration and passes it through unchanged", async () => {
    const config = validConfig();
    const { promise, fetchMock, supabase } = run(config);
    await expect(promise).resolves.toMatchObject({ executionId: "exec-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toMatch(/\/executions\/iotgw-ng\/provisioning$/);
    const jsonData = JSON.parse((init.body as FormData).get("json_data") as string);
    // Every provisioning key reaches Kestra as-is, plus the injected keys.
    expect(jsonData).toMatchObject(config);
    expect(jsonData).toMatchObject({
      target_ip: "10.0.0.10",
      ssh_key_id: "ssh-key-1",
      device_uuid: "device-1",
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects an enabled stack with a missing required field, naming it", async () => {
    const config = validConfig();
    delete config.iiot_host; // mqtt: true requires it
    const errorSpy = vi.spyOn(logger, "error");
    const { promise, fetchMock } = run(config);

    await expect(promise).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "iiot_host is required when `mqtt` is enabled",
      ),
    } satisfies Partial<TRPCError>);
    expect(fetchMock).not.toHaveBeenCalled();
    // Neither the error message nor anything logged carries a secret value.
    await promise.catch((error: TRPCError) => {
      expect(error.message).not.toContain(SECRET);
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(SECRET);
  });

  it("lists every problem, including base fields and CHANGE_ME placeholders", async () => {
    const config = validConfig();
    delete config.primary_ntp;
    config.root_password = "CHANGE_ME";
    const { promise } = run(config);
    await expect(promise).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(
        /primary_ntp is required.*root_password still holds the CHANGE_ME placeholder/,
      ),
    });
  });

  it("accepts an optional LAN netmask, dotted or as a prefix (task-131)", async () => {
    for (const local_netmask of ["255.255.255.0", "24", "/26", undefined]) {
      const config = validConfig();
      if (local_netmask === undefined) delete config.local_netmask;
      else config.local_netmask = local_netmask;
      const { promise } = run(config);
      await expect(promise).resolves.toMatchObject({ executionId: "exec-1" });
    }
  });

  it("rejects an invalid LAN netmask before Kestra runs (task-131)", async () => {
    for (const local_netmask of ["255.255.0.255", "31", "10.0.0.1"]) {
      const config = validConfig();
      config.local_netmask = local_netmask;
      const { promise, fetchMock } = run(config);
      await expect(promise).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("local_netmask has an invalid format"),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("does not require the fields of a disabled stack", async () => {
    const config = validConfig();
    config.mqtt = false;
    for (const key of [
      "iiot_host",
      "iiot_mqtt_user",
      "iiot_mqtt_password",
      "mqtt_bridge_topics",
      "emqx_api_url",
      "emqx_api_key",
      "emqx_api_secret",
    ]) {
      delete config[key];
    }
    const { promise, fetchMock } = run(config);
    await expect(promise).resolves.toMatchObject({ executionId: "exec-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the install flow unaffected (no provisioning keys needed)", async () => {
    const { promise, fetchMock } = run(
      {
        osInstallation: {
          target_disk: "/dev/nvme0n1",
          openwrt_version: "23.05.4",
        },
      },
      "install",
    );
    await expect(promise).resolves.toMatchObject({ executionId: "exec-1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, any];
    expect(url).toMatch(/\/executions\/iotgw-ng\/install$/);
    expect(
      JSON.parse((init.body as FormData).get("json_data") as string),
    ).toMatchObject({ target_disk: "/dev/nvme0n1", openwrt_version: "23.05.4" });
  });
});

describe("redactForLog", () => {
  it("drops configurations and masks schema secrets wherever they appear", () => {
    const redacted = JSON.stringify(
      redactForLog({
        deployment_id: "d-1",
        configuration: validConfig(),
        nested: { root_password: SECRET, users: [{ password: SECRET }] },
      }),
    );
    expect(redacted).not.toContain(SECRET);
    expect(redacted).toContain("d-1");
  });
});
