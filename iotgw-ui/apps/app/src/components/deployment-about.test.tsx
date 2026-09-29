import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type { DeploymentInfo } from "../../../backend/src/services/deployment-info";
import { DeploymentAbout } from "./deployment-about";

const { frontend, loadInfo } = vi.hoisted(() => ({
  frontend: {
    component: "frontend" as const,
    version: "0.10.2",
    revision: "a".repeat(40),
    release: "v1.2.3",
    builtAt: "2026-09-29T10:00:00Z",
    development: false,
    dirty: false,
  },
  loadInfo: vi.fn<() => Promise<DeploymentInfo>>(),
}));
vi.mock("@/utils/version", () => ({ frontendBuild: frontend }));
vi.mock("@/utils/trpc", () => ({
  trpc: {
    getDeploymentInfo: {
      queryOptions: () => ({
        queryKey: ["deployment-info-test"],
        queryFn: loadInfo,
      }),
    },
  },
}));
const copyText = vi.fn<(text: string) => Promise<void>>();

function releaseInfo(): DeploymentInfo {
  return {
    backend: { ...frontend, component: "backend", version: "1.0.0" },
    metadataStatus: "available",
    manifest: {
      schemaVersion: 1,
      product: "Edge Manager",
      release: "v1.2.3",
      environment: "production",
      createdAt: frontend.builtAt,
      components: ["frontend", "backend"].map((id) => ({
        id,
        name: id,
        version: id === "frontend" ? frontend.version : "1.0.0",
        revision: frontend.revision,
        image: null,
        workload: null,
        observation: null,
      })),
    },
  };
}
function renderAbout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DeploymentAbout />
    </QueryClientProvider>,
  );
}

describe("deployment version badge", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    frontend.development = false;
    frontend.dirty = false;
    loadInfo.mockReset().mockResolvedValue(releaseInfo());
    copyText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: copyText },
    });
  });

  it("shows the product release and copies running component identities", async () => {
    renderAbout();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "About this deployment · v1.2.3",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Backend API")).toBeVisible();
    expect(within(dialog).getAllByText("Matches declaration")).toHaveLength(2);
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Copy diagnostic information",
      }),
    );
    await waitFor(() => expect(copyText).toHaveBeenCalledOnce());
    const copied: unknown = JSON.parse(copyText.mock.calls[0][0]);
    expect(copied).toMatchObject({
      release: "v1.2.3",
      frontend: { revision: frontend.revision },
      backend: { version: "1.0.0" },
    });
  });

  it("flags a partial rollout and allows manual copying if clipboard access is denied", async () => {
    const info = releaseInfo();
    info.backend.revision = "b".repeat(40);
    loadInfo.mockResolvedValue(info);
    copyText.mockRejectedValue(new Error("Denied"));
    renderAbout();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "About this deployment · v1.2.3",
      }),
    );
    expect(screen.getByText("Differs from declaration")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Copy diagnostic information" }),
    );
    const fallback = await screen.findByRole("textbox", {
      name: "Deployment diagnostics",
    });
    expect(fallback).toHaveFocus();
    expect((fallback as HTMLTextAreaElement).value).toContain(
      '"status": "mismatch"',
    );
  });

  it("keeps a local DEV identity even when connected to a released backend", async () => {
    frontend.development = true;
    frontend.dirty = true;
    renderAbout();
    expect(loadInfo).not.toHaveBeenCalled();
    const badge = screen.getByRole("button", {
      name: "About this deployment · DEV · aaaaaaa*",
    });
    fireEvent.click(badge);
    await screen.findByText("Backend API");
    expect(badge).toHaveTextContent("DEV · aaaaaaa*");
    expect(screen.getByText("Development")).toBeVisible();
  });

  it("handles an older or unreachable backend without substituting a package version", async () => {
    loadInfo.mockRejectedValue(new Error("Procedure not available"));
    renderAbout();
    fireEvent.click(
      screen.getByRole("button", {
        name: "About this deployment · BUILD · aaaaaaa",
      }),
    );
    await screen.findByRole("alert");
    expect(screen.getByText("Not declared")).toBeVisible();
    expect(screen.getByText("User interface")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  it("translates the dialog and explains missing release metadata", async () => {
    await i18n.changeLanguage("es");
    loadInfo.mockResolvedValue({
      ...releaseInfo(),
      manifest: null,
      metadataStatus: "missing",
    });
    renderAbout();
    fireEvent.click(
      screen.getByRole("button", { name: /Acerca de este despliegue/ }),
    );
    expect(
      await screen.findByText(/Este despliegue no tiene un manifiesto/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Copiar información de diagnóstico" }),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      "deploymentAbout.",
    );
  });
});
