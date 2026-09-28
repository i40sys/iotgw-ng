import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@iotgw/supabase-contract";
import i18n from "@/i18n";
import { DeploymentJobsList } from "./deployment-jobs-list";

type Job = Database["public"]["Tables"]["deployment_jobs"]["Row"];
const listJobs = vi.fn<() => Promise<Job[]>>();
const queryKey = ["deployment-jobs-test"];

vi.mock("@/utils/trpc", () => ({
  trpc: {
    listDeploymentJobs: {
      queryOptions: () => ({ queryKey, queryFn: listJobs }),
    },
  },
}));
vi.mock("./deployment-config-viewer", () => ({
  DeploymentConfigViewer: () => null,
}));

const jobs: Job[] = Array.from({ length: 23 }, (_, index) => ({
  id: `job-${index}`,
  execution_id: `execution-${index}`,
  flow_id: "provisioning",
  status: "SUCCESS",
  device_id: `device-${index}`,
  device_name: `Gateway ${index}`,
  device_ip_address: `10.20.0.${index}`,
  device_description: null,
  network_id: "network-1",
  network_name: "factory-network",
  network_cidr: null,
  network_ipv4: null,
  network_ipv6: null,
  domain_id: "domain-1",
  domain_name: "factory.example.test",
  domain_display_name: "Barcelona Manufacturing",
  deployment_id: "deployment-1",
  deployment_name: "OpenWRT provisioning",
  deployment_version: "1.0",
  configuration_json: {},
  started_at: "2026-09-28T09:30:00Z",
  completed_at: "2026-09-28T09:32:00Z",
  error_message: null,
  created_by: null,
  created_at: "2026-09-28T09:30:00Z",
  ssh_key_id: null,
}));

const renderJobs = async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DeploymentJobsList onViewLogs={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByText("Showing 1–10 of 23 jobs");
  return client;
};

const goToLastPage = () => {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
};

describe("DeploymentJobsList result navigation", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    listJobs.mockReset().mockResolvedValue(jobs);
  });

  it("returns to the first page when searching and when clearing filters", async () => {
    await renderJobs();
    goToLastPage();

    // Combine the visible domain name with an execution ID, regardless of case.
    fireEvent.change(screen.getByRole("searchbox", { name: "Search jobs" }), {
      target: { value: "BARCELONA execution-0" },
    });
    expect(screen.getByText("Showing 1–1 of 1 job")).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByText("Gateway 0"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Showing 1–10 of 23 jobs")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("keeps results visible when a refresh removes the current page", async () => {
    const client = await renderJobs();
    goToLastPage();

    act(() => {
      client.setQueryData(queryKey, jobs.slice(0, 2));
    });
    await waitFor(() => {
      expect(screen.getByText("Showing 1–2 of 2 jobs")).toBeInTheDocument();
    });
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Gateway 0")).toBeInTheDocument();
    expect(table.getByText("Gateway 1")).toBeInTheDocument();
    expect(screen.queryByText("Page 3 of 1")).not.toBeInTheDocument();
  });
});
