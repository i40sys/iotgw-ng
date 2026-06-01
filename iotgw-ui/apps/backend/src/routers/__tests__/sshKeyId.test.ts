import { describe, it, expect, vi, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../router";

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

  const updateResults = {
    devices: overrides.updates?.devices ?? { data: null, error: null },
  };

  return {
    from: vi.fn((table: string) => {
      const builder = tableBuilders[table];
      if (!builder) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        ...builder,
        update: vi.fn(() => {
          const updateBuilder: UpdateBuilder = {
            eq: vi.fn(async () => updateResults[table as keyof typeof updateResults]),
          };
          return updateBuilder;
        }),
      };
    }),
    rpc: vi.fn(async () => overrides.rpcResult ?? { data: null, error: null }),
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

  it("generateMissingSshKey returns existing ssh_key_id without calling Kestra", async () => {
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

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as any);

    const caller = createCaller(supabase);
    const result = await caller.generateMissingSshKey({ device_id: "device-1" });

    expect(result).toEqual({ status: "exists", sshKeyId: "ssh-key-1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("generateMissingSshKey triggers Kestra and returns generated ssh_key_id", async () => {
    const supabase = createSupabaseMock({
      devices: [
        {
          data: {
            id: "device-1",
            name: "Device One",
            network_id: "network-1",
            ssh_key_id: null,
          },
          error: null,
        },
        {
          data: {
            ssh_key_id: "device_ssh_device-1",
          },
          error: null,
        },
      ],
      networks: {
        data: { id: "network-1", domain_id: "domain-1" },
        error: null,
      },
      domains: {
        data: { id: "domain-1" },
        error: null,
      },
    });

    const fetchResponses = [
      {
        ok: true,
        json: async () => ({ id: "exec-123" }),
      },
      {
        ok: true,
        json: async () => ({ state: { current: "SUCCESS" } }),
      },
    ];
    const fetchMock = vi.fn(async () => fetchResponses.shift());
    vi.stubGlobal("fetch", fetchMock as any);

    const caller = createCaller(supabase);
    const result = await caller.generateMissingSshKey({ device_id: "device-1" });

    expect(result).toEqual({
      status: "generated",
      sshKeyId: "device_ssh_device-1",
      executionId: "exec-123",
    });
  });
});
