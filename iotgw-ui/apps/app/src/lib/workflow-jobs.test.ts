import { beforeEach, describe, expect, it } from "vitest";
import {
  filterAndSortJobs,
  jobDuration,
  loadJobPreferences,
  type DeviceJob,
  type NetworkJob,
} from "./workflow-jobs";

const networkJob = (overrides: Partial<NetworkJob> = {}): NetworkJob => ({
  id: "job-1",
  execution_id: "execution-1",
  transaction_id: "transaction-1",
  flow_id: "network",
  network_id: "network-1",
  network_name: "Factory network",
  network_cidr: null,
  network_ipv4: "10.0.0.0/24",
  network_ipv6: null,
  domain_id: "domain-1",
  domain_name: "factory.example.test",
  domain_display_name: "Barcelona Manufacturing",
  status: "SUCCESS",
  started_at: "2026-09-28T10:00:00Z",
  completed_at: "2026-09-28T10:02:00Z",
  created_at: null,
  created_by: null,
  error_message: null,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe("job preferences", () => {
  it("migrates existing filters and retains sorting and practical page sizes", () => {
    localStorage.setItem(
      "device-jobs-preferences",
      JSON.stringify({
        filterDeviceName: "Gateway",
        filterNetworkName: "Factory",
        filterExecutionOrTransaction: "transaction-1",
        itemsPerPage: 25,
        filterStatus: "failed",
        sortField: "completed_at",
        sortDirection: "asc",
      }),
    );
    expect(loadJobPreferences("device")).toEqual({
      search: "transaction-1 Gateway Factory",
      itemsPerPage: 25,
      filterStatus: "FAILED",
      filterDomain: "all",
      sortField: "completed_at",
      sortDirection: "asc",
    });
    expect(loadJobPreferences("device", "Selected gateway").search).toBe(
      "Selected gateway",
    );
  });

  it("recovers from corrupted and invalid stored preferences", () => {
    localStorage.setItem("network-jobs-preferences", "not-json");
    expect(loadJobPreferences("network").itemsPerPage).toBe(10);
    localStorage.setItem(
      "network-jobs-preferences",
      JSON.stringify({
        search: {},
        itemsPerPage: -1,
        filterStatus: ["FAILED"],
        sortField: "invalid",
        sortDirection: null,
      }),
    );
    expect(loadJobPreferences("network")).toEqual({
      search: "",
      itemsPerPage: 10,
      filterStatus: "all",
      filterDomain: "all",
      sortField: "started_at",
      sortDirection: "desc",
    });
  });

  it("keeps device and network preferences separate and caps legacy sizes at the fetch limit", () => {
    localStorage.setItem(
      "network-jobs-preferences",
      JSON.stringify({
        search: "Factory",
        filterDomain: "domain-1",
        itemsPerPage: 500,
      }),
    );
    expect(loadJobPreferences("network")).toMatchObject({
      search: "Factory",
      filterDomain: "domain-1",
      itemsPerPage: 100,
    });
    expect(loadJobPreferences("device")).toMatchObject({
      search: "",
      filterDomain: "all",
      itemsPerPage: 10,
    });
  });
});

describe("job results", () => {
  it("searches device jobs with missing network, address, and transaction data without crashing", () => {
    const job: DeviceJob = {
      ...networkJob(),
      device_id: "device-1",
      device_name: "Gateway North",
      device_description: null,
      device_ip_address: null,
      network_id: null,
      network_name: null,
      transaction_id: null,
    };
    const preferences = {
      ...loadJobPreferences("device"),
      search: "GATEWAY execution-1",
    };
    expect(filterAndSortJobs([job], preferences)).toEqual([job]);
    expect(
      filterAndSortJobs([job], { ...preferences, search: "missing-network" }),
    ).toEqual([]);
  });

  it("combines status/domain filters with display-name, address, and transaction searches", () => {
    const job = networkJob();
    const preferences = {
      ...loadJobPreferences("network"),
      search: "BARCELONA 10.0.0.0 transaction-1",
      filterStatus: "SUCCESS",
      filterDomain: "domain-1",
    };
    expect(
      filterAndSortJobs(
        [
          job,
          networkJob({ domain_id: "domain-2" }),
          networkJob({ status: "FAILED" }),
        ],
        preferences,
      ),
    ).toEqual([job]);
  });

  it("sorts completion times in both directions while leaving unfinished jobs last", () => {
    const early = networkJob({
      id: "early",
      completed_at: "2026-09-28T10:01:00Z",
    });
    const late = networkJob({
      id: "late",
      completed_at: "2026-09-28T11:00:00Z",
    });
    const pending = networkJob({ id: "pending", completed_at: null });
    const jobs = [pending, early, late];
    const preferences = {
      ...loadJobPreferences("network"),
      sortField: "completed_at" as const,
    };
    expect(filterAndSortJobs(jobs, preferences).map((job) => job.id)).toEqual([
      "late",
      "early",
      "pending",
    ]);
    expect(
      filterAndSortJobs(jobs, { ...preferences, sortDirection: "asc" }).map(
        (job) => job.id,
      ),
    ).toEqual(["early", "late", "pending"]);
    expect(jobs[0].id).toBe("pending");
  });

  it("shows duration only for valid completed runs", () => {
    expect(jobDuration(networkJob())).toBe("2m 0s");
    expect(jobDuration(networkJob({ completed_at: null }))).toBeNull();
    expect(
      jobDuration(networkJob({ completed_at: "2026-09-28T09:59:00Z" })),
    ).toBeNull();
    expect(jobDuration(networkJob({ completed_at: "invalid" }))).toBeNull();
  });
});
