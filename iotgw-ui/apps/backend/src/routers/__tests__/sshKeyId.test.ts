import { describe, it, expect, vi, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../router";
import { ensureDeviceSshKey } from "../../services/kms";

// SSH-key generation now goes directly to Cosmian KMS (decision-010); mock the
// KMS client rather than Kestra/fetch.
vi.mock("../../services/kms", () => ({
  ensureDeviceSshKey: vi.fn(),
  deviceSshKeyId: (id: string) => `device_ssh_${id}`,
}));

const mockEnsure = vi.mocked(ensureDeviceSshKey);

type SupabaseResult<T> = { data: T; error: null } | { data: null; error: any };
type SupabaseResultSequence<T> = SupabaseResult<T> | SupabaseResult<T>[];

type QueryBuilder<T> = {
  select: (query?: string) => QueryBuilder<T>;
  eq: (column: string, value: string) => QueryBuilder<T>;
  single: () => Promise<SupabaseResult<T>>;
};

type UpdateBuilder = {
  eq: (column: string, value: string) => Promise<SupabaseResult<any>>;
};

const createSingleQuery = <T>(
  result: SupabaseResultSequence<T>,
): QueryBuilder<T> => {
  const results = Array.isArray(result) ? [...result] : [result];
  const builder: QueryBuilder<T> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => results.shift() ?? { data: null, error: null }),
  };

  return builder;
};

const createSupabaseMock = (overrides: {
  devices?: SupabaseResultSequence<any>;
  networks?: SupabaseResultSequence<any>;
  domains?: SupabaseResultSequence<any>;
  deployments?: SupabaseResultSequence<any>;
  inserts?: {
    devices?: SupabaseResult<any>;
  };
  updates?: {
    devices?: SupabaseResult<any>;
  };
  rpcResult?: { data?: any; error?: any };
}) => {
  const tableBuilders: Record<string, QueryBuilder<any>> = {
    devices: createSingleQuery(overrides.devices ?? { data: null, error: null }),
    networks: createSingleQuery(overrides.networks ?? { data: null, error: null }),
    domains: createSingleQuery(overrides.domains ?? { data: null, error: null }),
    deployments: createSingleQuery(overrides.deployments ?? { data: null, error: null }),
  };

  const insertResults = {
    devices: overrides.inserts?.devices ?? { data: null, error: null },
  };

  const updateResults = {
    devices: overrides.updates?.devices ?? { data: null, error: null },
  };

  // Stable per-table update spies so tests can assert the ssh_key_id write
  // (which column/row was updated, or that no update happened on failure).
  const updateSpies: Record<string, { update: any; eq: any }> = {};
  const getUpdateSpy = (table: string) => {
    if (!updateSpies[table]) {
      const eq = vi.fn(
        async () =>
          updateResults[table as keyof typeof updateResults] ?? {
            data: null,
            error: null,
          },
      );
      const update = vi.fn(() => ({ eq }) as UpdateBuilder);
      updateSpies[table] = { update, eq };
    }
    return updateSpies[table];
  };

  return {
    from: vi.fn((table: string) => {
      const builder = tableBuilders[table];
      if (!builder) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        ...builder,
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(
              async () =>
                insertResults[table as keyof typeof insertResults] ?? {
                  data: null,
                  error: null,
                },
            ),
          })),
        })),
        update: getUpdateSpy(table).update,
      };
    }),
    rpc: vi.fn(async () => overrides.rpcResult ?? { data: null, error: null }),
    _updates: updateSpies,
  };
};

const createCaller = (supabase: any) => {
  return appRouter.createCaller({
    supabase,
    req: {} as any,
    res: {} as any,
    user: { name: "test" },
  });
};

describe("SSH key ID routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockEnsure.mockReset();
  });

  it("checkSshKeyStatus returns hasSshKey true when ssh_key_id exists", async () => {
    const supabase = createSupabaseMock({
      devices: { data: { ssh_key_id: "key-123" }, error: null },
    });

    const caller = createCaller(supabase);
    const result = await caller.checkSshKeyStatus({ device_id: "device-1" });

    expect(result).toEqual({ hasSshKey: true, sshKeyId: "key-123" });
  });

  it("executeKestraDeployment fails when ssh_key_id is missing", async () => {
    const supabase = createSupabaseMock({
      devices: {
        data: {
          id: "device-1",
          name: "Device One",
          description: null,
          ip_address: "10.0.0.10",
          network_id: "network-1",
          ssh_key_id: null,
        },
        error: null,
      },
    });

    const caller = createCaller(supabase);

    await expect(
      caller.executeKestraDeployment({
        device_id: "device-1",
        deployment_id: "deployment-1",
        flow_type: "install",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("does not have an SSH key"),
    } satisfies Partial<TRPCError>);
  });

  it("executeKestraDeployment passes ssh_key_id into deployment job snapshot", async () => {
    const supabase = createSupabaseMock({
      devices: {
        data: {
          id: "device-1",
          name: "Device One",
          description: "Test device",
          ip_address: "10.0.0.10",
          network_id: "network-1",
          ssh_key_id: "ssh-key-1",
        },
        error: null,
      },
      networks: {
        data: {
          id: "network-1",
          name: "Network One",
          ipv4_cidr: "10.0.0.0/24",
          ipv6_cidr: null,
          domain_id: "domain-1",
        },
        error: null,
      },
      domains: {
        data: { id: "domain-1", name: "example", display_name: "Example" },
        error: null,
      },
      deployments: {
        data: {
          id: "deployment-1",
          name: "Deployment One",
          version: "1",
          configuration: { foo: "bar" },
        },
        error: null,
      },
      rpcResult: { data: null, error: null },
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "exec-1", flowId: "iotgw-ng/install" }),
    }));
    vi.stubGlobal("fetch", fetchMock as any);

    const caller = createCaller(supabase);
    await caller.executeKestraDeployment({
      device_id: "device-1",
      deployment_id: "deployment-1",
      flow_type: "install",
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [, rpcArgs] = (supabase.rpc as any).mock.calls[0];
    expect(rpcArgs.p_ssh_key_id).toBe("ssh-key-1");
    expect(rpcArgs.p_configuration_json).toMatchObject({
      foo: "bar",
      target_ip: "10.0.0.10",
      ssh_key_id: "ssh-key-1",
    });
  });

  it("generateMissingSshKey returns existing ssh_key_id without calling KMS", async () => {
    const supabase = createSupabaseMock({
      devices: {
        data: {
          id: "device-1",
          name: "Device One",
          network_id: "network-1",
          ssh_key_id: "ssh-key-1",
        },
        error: null,
      },
    });

    const caller = createCaller(supabase);
    const result = await caller.generateMissingSshKey({ device_id: "device-1" });

    expect(result).toEqual({ status: "exists", sshKeyId: "ssh-key-1" });
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("generateMissingSshKey mints a key in KMS and returns its id", async () => {
    const supabase = createSupabaseMock({
      devices: {
        data: {
          id: "device-1",
          name: "Device One",
          network_id: "network-1",
          ssh_key_id: null,
        },
        error: null,
      },
      networks: {
        data: { id: "network-1", domain_id: "domain-1" },
        error: null,
      },
      domains: {
        data: { id: "domain-1" },
        error: null,
      },
      updates: { devices: { data: null, error: null } },
    });

    mockEnsure.mockResolvedValue({
      sshKeyId: "device_ssh_device-1",
      created: true,
    });

    const caller = createCaller(supabase);
    const result = await caller.generateMissingSshKey({ device_id: "device-1" });

    expect(result).toEqual({
      status: "generated",
      sshKeyId: "device_ssh_device-1",
    });
    expect(mockEnsure).toHaveBeenCalledWith({
      deviceId: "device-1",
      networkId: "network-1",
      domainId: "domain-1",
      force: undefined,
    });
  });

  it("generateMissingSshKey surfaces a KMS failure as INTERNAL_SERVER_ERROR", async () => {
    const supabase = createSupabaseMock({
      devices: {
        data: {
          id: "device-1",
          name: "Device One",
          network_id: "network-1",
          ssh_key_id: null,
        },
        error: null,
      },
      networks: { data: { id: "network-1", domain_id: "domain-1" }, error: null },
      domains: { data: { id: "domain-1" }, error: null },
    });

    mockEnsure.mockRejectedValue(new Error("KMS unreachable"));

    const caller = createCaller(supabase);

    await expect(
      caller.generateMissingSshKey({ device_id: "device-1" }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("createDevice auto-generates an SSH key in KMS on insert", async () => {
    const supabase = createSupabaseMock({
      inserts: {
        devices: {
          data: {
            id: "device-9",
            name: "New Device",
            network_id: "network-1",
            ssh_key_id: null,
            network: { id: "network-1", domain_id: "domain-1" },
          },
          error: null,
        },
      },
      updates: { devices: { data: null, error: null } },
    });

    mockEnsure.mockResolvedValue({
      sshKeyId: "device_ssh_device-9",
      created: true,
    });

    const caller = createCaller(supabase);
    const result = await caller.createDevice({
      network_id: "network-1",
      name: "New Device",
    });

    expect(mockEnsure).toHaveBeenCalledWith({
      deviceId: "device-9",
      networkId: "network-1",
      domainId: "domain-1",
    });
    // the generated id is persisted to the right column on the right row
    expect(supabase._updates.devices.update).toHaveBeenCalledWith({
      ssh_key_id: "device_ssh_device-9",
    });
    expect(supabase._updates.devices.eq).toHaveBeenCalledWith("id", "device-9");
    expect(result).toMatchObject({ id: "device-9", ssh_key_id: "device_ssh_device-9" });
  });

  it("createDevice still succeeds (degraded) when KMS generation fails", async () => {
    const supabase = createSupabaseMock({
      inserts: {
        devices: {
          data: {
            id: "device-9",
            name: "New Device",
            network_id: "network-1",
            ssh_key_id: null,
            network: { id: "network-1", domain_id: "domain-1" },
          },
          error: null,
        },
      },
    });

    mockEnsure.mockRejectedValue(new Error("KMS down"));

    const caller = createCaller(supabase);
    const result = await caller.createDevice({
      network_id: "network-1",
      name: "New Device",
    });

    // device is returned without an ssh_key_id; creation is not blocked and no
    // ssh_key_id UPDATE is attempted when generation failed
    expect(result).toMatchObject({ id: "device-9", ssh_key_id: null });
    expect(supabase._updates.devices.update).not.toHaveBeenCalled();
    expect(mockEnsure).toHaveBeenCalledOnce();
  });

  it("createDevice tolerates a failed ssh_key_id UPDATE (returns the bare device)", async () => {
    const supabase = createSupabaseMock({
      inserts: {
        devices: {
          data: {
            id: "device-9",
            name: "New Device",
            network_id: "network-1",
            ssh_key_id: null,
            network: { id: "network-1", domain_id: "domain-1" },
          },
          error: null,
        },
      },
      updates: { devices: { data: null, error: { message: "write failed" } } },
    });

    mockEnsure.mockResolvedValue({
      sshKeyId: "device_ssh_device-9",
      created: true,
    });

    const caller = createCaller(supabase);
    const result = await caller.createDevice({
      network_id: "network-1",
      name: "New Device",
    });

    // KMS minted the key but persisting it failed -> bare device row, no throw
    expect(supabase._updates.devices.update).toHaveBeenCalledWith({
      ssh_key_id: "device_ssh_device-9",
    });
    expect(result).toMatchObject({ id: "device-9", ssh_key_id: null });
  });
});
