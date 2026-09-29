import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import type { DeploymentVersion } from "../src/lib/deployment-workspace";
import type { Json } from "@iotgw/supabase-contract";

const example = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/supabase-contract/src/deployment-config.example.json",
      import.meta.url,
    ),
    "utf8",
  ).replaceAll("CHANGE_ME", "fixture-not-a-real-secret"),
) as Record<string, Json>;
const devices = [
  {
    id: "device-a",
    name: "Warehouse gateway",
    ip_address: "10.20.0.10",
    network_id: "network-a",
    ssh_key_id: "key-a",
  },
  {
    id: "device-b",
    name: "Office gateway",
    ip_address: "10.30.0.20",
    network_id: "network-b",
    ssh_key_id: "key-b",
  },
];
function version(deviceId: string, number: string): DeploymentVersion {
  return {
    id: `${deviceId}-v${number}`,
    device_id: deviceId,
    version: number,
    name: `${deviceId === "device-a" ? "Warehouse" : "Office"} baseline`,
    description: "Reviewed configuration",
    configuration: { ...example, name: "Baseline", version: number },
    created_at: "2026-09-20T10:00:00Z",
    modified_at: "2026-09-28T10:00:00Z",
    created_by: null,
    modified_by: null,
    short: null,
  };
}
interface MockState {
  versions: DeploymentVersion[];
  calls: { procedure: string; input: Record<string, unknown> }[];
  failSaves: boolean;
  status: "RUNNING" | "SUCCESS";
  delayVersionsFor?: string;
}
async function setup(
  page: Page,
  options: { empty?: boolean; language?: string; noKey?: boolean } = {},
): Promise<MockState> {
  const state: MockState = {
    versions: options.empty
      ? []
      : [
          version("device-a", "1"),
          version("device-a", "2"),
          version("device-b", "1"),
        ],
    calls: [],
    failSaves: false,
    status: "RUNNING",
  };
  await page.addInitScript(
    ({ language }) => {
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: "preview-operator", exp: expires }))}.fixture`;
      localStorage.setItem(
        "iotgw-ui-auth",
        JSON.stringify({
          access_token: token,
          refresh_token: "fixture",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: expires,
          user: {
            id: "preview-operator",
            email: "preview@example.test",
            app_metadata: { iotgw_role: "operator" },
            user_metadata: {},
            aud: "authenticated",
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      );
      localStorage.setItem("iotgw-ui-language", language);
    },
    { language: options.language ?? "en" },
  );
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const appUrl = new URL(test.info().project.use.baseURL as string);
    if (url.origin === appUrl.origin) return route.continue();
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
      });
    const procedures = url.pathname.replace(/^\//, "").split(",");
    const input = JSON.parse(
      request.method() === "POST"
        ? (request.postData() ?? "{}")
        : (url.searchParams.get("input") ?? "{}"),
    ) as Record<string, Record<string, unknown>>;
    const results: unknown[] = [];
    for (const [index, procedure] of procedures.entries()) {
      const args = input[String(index)] ?? {};
      state.calls.push({ procedure, input: args });
      let data: unknown;
      switch (procedure) {
        case "getDeploymentInfo":
          data = {
            backend: {
              component: "backend",
              version: "1.0.0",
              revision: "b".repeat(40),
              release: null,
              builtAt: "2026-09-29T10:00:00Z",
              dirty: false,
              development: true,
            },
            manifest: null,
            metadataStatus: "missing",
          };
          break;
        case "getDevicesFiltered":
          data = devices.map((device) => ({
            ...device,
            ssh_key_id: options.noKey ? null : device.ssh_key_id,
          }));
          break;
        case "getDomains":
          data = [
            { id: "domain-a", name: "Warehouse", display_name: "Warehouse" },
            { id: "domain-b", name: "Office", display_name: "Office" },
          ];
          break;
        case "getNetworks":
          data = [
            { id: "network-a", domain_id: "domain-a", name: "Operations" },
            { id: "network-b", domain_id: "domain-b", name: "Office LAN" },
          ];
          break;
        case "getDeviceCode":
          data = {
            code: "000000000",
            next: false,
            validUntil: new Date(Date.now() + 600_000).toISOString(),
          };
          break;
        case "getDeploymentVersions":
          if (state.delayVersionsFor === args.device_id)
            await new Promise((resolve) => setTimeout(resolve, 800));
          data = state.versions.filter((v) => v.device_id === args.device_id);
          break;
        case "createDeployment":
        case "updateDeployment": {
          if (state.failSaves) {
            results.push({
              error: {
                message: "Simulated save failure",
                code: -32603,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
              },
            });
            continue;
          }
          const existing = state.versions.find((v) => v.id === args.id);
          const saved = {
            ...version(
              String(args.device_id),
              String(args.version ?? existing?.version ?? "1"),
            ),
            ...args,
            modified_at: new Date().toISOString(),
          } as DeploymentVersion;
          state.versions = [
            saved,
            ...state.versions.filter((v) => v.id !== saved.id),
          ];
          data = saved;
          break;
        }
        case "deleteDeployment":
          state.versions = state.versions.filter((v) => v.id !== args.id);
          data = { success: true };
          break;
        case "executeKestraDeployment":
          data = {
            executionId: "fixture-execution",
            flowId: args.flow_type,
            status: "RUNNING",
            startedAt: new Date().toISOString(),
            message: "Operation started",
          };
          break;
        case "checkKestraExecutionStatus":
          data = {
            status: state.status,
            startedAt: "2026-09-29T00:00:00Z",
            completedAt:
              state.status === "SUCCESS" ? new Date().toISOString() : undefined,
            message: "Fixture operation",
          };
          break;
        case "listDeploymentJobs":
          data = [];
          break;
        default:
          throw new Error(
            `Unmocked external request: ${url.origin}/${procedure}`,
          );
      }
      results.push({ result: { data } });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(results),
    });
  });
  return state;
}
const writes = (state: MockState) =>
  state.calls.filter((call) =>
    /^(create|update|delete|execute)/.test(call.procedure),
  );
async function openInstallation(page: Page) {
  await page.goto("/deployments?deviceId=device-a&step=os-installation");
  await expect(
    page.getByRole("button", {
      name: "Configuration: Warehouse baseline",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Install OpenWrt/ }),
  ).toHaveAttribute("data-state", "active");
}
async function openConfiguration(page: Page) {
  await page
    .getByRole("group", { name: "Workspace view" })
    .getByRole("button", { name: /^Configuration(?::|$)/ })
    .click();
}

test("the version badge opens responsive deployment details and supports manual copying", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined });
  });
  await page.goto("/deployments?deviceId=device-a&step=os-installation");
  const trigger = page.getByRole("button", { name: /About this deployment/ });
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(trigger).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Backend API", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Not declared", { exact: true }),
    ).toBeVisible();
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await dialog
      .getByRole("button", { name: "Copy diagnostic information" })
      .click();
    await expect(
      dialog.getByRole("textbox", { name: "Deployment diagnostics" }),
    ).toBeFocused();
    await page.screenshot({
      path: test.info().outputPath(`deployment-about-${width}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});

test("device search and workspace navigation preserve edits without writing a configuration", async ({
  page,
}) => {
  const state = await setup(page, { empty: true });
  await page.goto("/deployments");
  await page
    .getByRole("button", { name: "Choose device", exact: true })
    .click();
  await page.getByLabel("Search devices…").fill("10.30");
  await expect(
    page.getByRole("button", { name: /Warehouse gateway/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Office gateway/ }).click();
  const views = page.getByRole("group", { name: "Workspace view" });
  await expect(views.getByRole("button")).toHaveText([
    "Configuration",
    "Setup",
    "Device activity",
  ]);
  await page.getByRole("tab", { name: /Install OpenWrt/ }).click();
  await page
    .getByTestId("field-osInstallation.target_disk")
    .getByRole("textbox")
    .fill("/dev/sda");
  await page.getByRole("tab", { name: /Provision services/ }).click();
  await openConfiguration(page);
  await expect(
    page.locator("[data-slot=badge]").filter({ hasText: "New draft" }),
  ).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page
    .getByLabel("Configuration name", { exact: true })
    .fill("Office baseline draft");
  await expect(views.getByRole("button").first()).toHaveText(
    "Configuration: Office baseline draft",
  );
  await views
    .getByRole("button", { name: "Device activity", exact: true })
    .click();
  await expect
    .poll(() =>
      state.calls.some(
        (call) =>
          call.procedure === "listDeploymentJobs" &&
          call.input.device_id === "device-b",
      ),
    )
    .toBe(true);
  await views.getByRole("button", { name: "Setup", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: /Provision services/ }),
  ).toHaveAttribute("data-state", "active");
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: /Install OpenWrt/ }).click();
  await expect(
    page.getByTestId("field-osInstallation.target_disk").getByRole("textbox"),
  ).toHaveValue("/dev/sda");
  await openConfiguration(page);
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveValue("Office baseline draft");
  expect(writes(state)).toEqual([]);
});

test("device switching protects edits and a failed save keeps the dialog and draft", async ({
  page,
}) => {
  const state = await setup(page);
  await openInstallation(page);
  await openConfiguration(page);
  await page
    .getByLabel("Configuration name", { exact: true })
    .fill("Local edit");
  await page
    .getByRole("button", { name: "Change device", exact: true })
    .click();
  await page.getByRole("button", { name: /Office gateway/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  state.failSaves = true;
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(
    page.getByText(/Could not save the configuration/),
  ).toBeVisible();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(page.url()).toContain("device-a");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveValue("Local edit");
  await page
    .getByRole("button", { name: "Change device", exact: true })
    .click();
  await page.getByRole("button", { name: /Office gateway/ }).click();
  await page
    .getByRole("button", { name: "Discard & continue", exact: true })
    .click();
  await openConfiguration(page);
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveValue("Office baseline");
  expect(
    writes(state).every((call) => call.input.device_id === "device-a"),
  ).toBe(true);
});

test("version switches and route navigation honor the unsaved changes guard", async ({
  page,
}) => {
  await setup(page);
  await openInstallation(page);
  await openConfiguration(page);
  await page
    .getByLabel("Configuration name", { exact: true })
    .fill("Keep this name");
  await page.getByRole("combobox", { name: "Saved version" }).click();
  await page.getByRole("option", { name: "v1 · Warehouse baseline" }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Saved version" }),
  ).toContainText("v2");
  await page.getByRole("link", { name: "All deployment jobs" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Save & continue", exact: true })
    .click();
  await expect(page).toHaveURL(/\/deployments\/jobs/);
});

test("installation requires disk acknowledgement and saves before executing exactly once", async ({
  page,
}) => {
  const state = await setup(page);
  await openInstallation(page);
  await openConfiguration(page);
  await page
    .getByLabel("Configuration name", { exact: true })
    .fill("Reviewed warehouse configuration");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Review installation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Warehouse gateway");
  await expect(dialog).toContainText("/dev/nvme0n1");
  const launch = dialog.getByRole("button", {
    name: "Save & install OpenWrt",
    exact: true,
  });
  await expect(launch).toBeDisabled();
  await page.getByRole("checkbox").check();
  await launch.click();
  await expect(page.getByRole("dialog")).toContainText("fixture-execution");
  expect(writes(state).map((call) => call.procedure)).toEqual([
    "updateDeployment",
    "executeKestraDeployment",
  ]);
  expect(writes(state)[1].input).toMatchObject({
    device_id: "device-a",
    deployment_id: "device-a-v2",
    flow_type: "install",
    configuration: { name: "Reviewed warehouse configuration", version: "2" },
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  const checks = state.calls.filter(
    (call) => call.procedure === "checkKestraExecutionStatus",
  ).length;
  await expect
    .poll(
      () =>
        state.calls.filter(
          (call) => call.procedure === "checkKestraExecutionStatus",
        ).length,
    )
    .toBeGreaterThan(checks);
  state.status = "SUCCESS";
  await expect(
    page.getByRole("button", { name: "View last operation" }),
  ).toBeVisible();
});

test("failed save never launches the reviewed operation", async ({ page }) => {
  const state = await setup(page);
  await openInstallation(page);
  await openConfiguration(page);
  state.failSaves = true;
  await page
    .getByLabel("Configuration name", { exact: true })
    .fill("Unsaved configuration");
  await page.getByRole("button", { name: "Setup", exact: true }).click();
  await page
    .getByRole("button", { name: "Review installation", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Save & install OpenWrt", exact: true })
    .click();
  await expect(
    page.getByText(/Could not save the configuration/),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Unsaved configuration");
  expect(writes(state).map((call) => call.procedure)).toEqual([
    "updateDeployment",
  ]);
});

test("missing SSH access and an invalid disk cannot launch an operation", async ({
  page,
}) => {
  const state = await setup(page, { noKey: true });
  await openInstallation(page);
  await page
    .getByTestId("field-osInstallation.target_disk")
    .getByRole("textbox")
    .fill("");
  await page
    .getByRole("button", { name: "Review installation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("SSH key");
  await expect(page.getByRole("alert")).toContainText("target_disk");
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Save & install OpenWrt", exact: true }),
  ).toBeDisabled();
  expect(writes(state)).toEqual([]);
});

test("explicit new versions have matching record and JSON version numbers", async ({
  page,
}) => {
  const state = await setup(page);
  await openInstallation(page);
  await openConfiguration(page);
  await page.getByRole("button", { name: "Configuration actions" }).click();
  await page.getByRole("menuitem", { name: "Save as new version" }).click();
  await expect(
    page.getByRole("combobox", { name: "Saved version" }),
  ).toContainText("v3");
  expect(writes(state)[0].input).toMatchObject({
    version: "3",
    configuration: { name: "Warehouse baseline", version: "3" },
  });
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
});

test("draft survives reload, and an explicit device URL never restores another device's draft", async ({
  page,
}) => {
  await setup(page);
  await openInstallation(page);
  await openConfiguration(page);
  await page
    .getByLabel("Configuration name", { exact: true })
    .fill("Draft preserved");
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.reload();
  await openConfiguration(page);
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveValue("Draft preserved");
  await page.goto("/deployments?deviceId=device-b&step=os-installation");
  await openConfiguration(page);
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveValue("Office baseline");
});

test("late configuration responses cannot attach to a different selected device", async ({
  page,
}) => {
  const state = await setup(page);
  state.delayVersionsFor = "device-a";
  await page.goto("/deployments?deviceId=device-a&step=os-installation");
  await page
    .getByRole("button", { name: "Change device", exact: true })
    .click();
  await page.getByRole("button", { name: /Office gateway/ }).click();
  await openConfiguration(page);
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveValue("Office baseline");
  await page.waitForTimeout(1000);
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toHaveValue("Office baseline");
  expect(writes(state)).toEqual([]);
});

test("mobile and tablet keep every stage and action reachable without horizontal overflow", async ({
  page,
}) => {
  await setup(page);
  await openInstallation(page);
  const longName =
    "warehouse-gateway-production-configuration-with-a-very-long-name";
  await openConfiguration(page);
  await page.getByLabel("Configuration name", { exact: true }).fill(longName);
  await page.screenshot({
    path: test.info().outputPath("configuration-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await openConfiguration(page);
    const views = page.getByRole("group", { name: "Workspace view" });
    for (const button of await views.getByRole("button").all()) {
      await expect(button).toBeInViewport();
    }
    await expect(views.getByRole("button").first()).toHaveAttribute(
      "title",
      `Configuration: ${longName}`,
    );
    await expect(
      page.getByLabel("Configuration name", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`configuration-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await views.getByRole("button", { name: "Setup", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const name of [
      /Boot live USB/,
      /Install OpenWrt/,
      /Reboot & verify/,
      /Provision services/,
    ])
      await expect(page.getByRole("tab", { name })).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: test.info().outputPath("setup-mobile.png"),
        fullPage: true,
        animations: "disabled",
      });
    await page
      .getByRole("button", { name: "Review installation", exact: true })
      .click();
    await expect(page.getByRole("checkbox")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Back to setup" }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "Back to setup" }).click();
  }
  await openConfiguration(page);
  await expect(
    page.getByLabel("Configuration name", { exact: true }),
  ).toBeVisible();
});

test("Spanish workspace uses translated actions and stage labels", async ({
  page,
}) => {
  await setup(page, { language: "es" });
  await page.goto("/deployments?deviceId=device-a&step=os-installation");
  await expect(
    page.getByRole("heading", { name: "Despliegues", exact: true }),
  ).toBeVisible();
  const views = page.getByRole("group", { name: "Vista de trabajo" });
  await expect(views.getByRole("button")).toHaveText([
    "Configuración: Warehouse baseline",
    "Preparación",
    "Actividad del dispositivo",
  ]);
  await views.getByRole("button").first().click();
  await expect(
    page.getByLabel("Nombre de configuración", { exact: true }),
  ).toBeVisible();
  await views.getByRole("button", { name: "Preparación", exact: true }).click();
  await page
    .getByRole("button", { name: "Revisar instalación", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Disco de destino");
  await expect(page.getByRole("dialog")).not.toContainText(
    "deployments.workspace.",
  );
});

test("a legacy configuration stored as JSON text executes the reviewed object", async ({
  page,
}) => {
  const state = await setup(page);
  state.versions = state.versions.map((saved) => ({
    ...saved,
    configuration: JSON.stringify(saved.configuration),
  }));
  await openInstallation(page);
  await page
    .getByRole("button", { name: "Review installation", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Install OpenWrt", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("fixture-execution");
  expect(writes(state).map((call) => call.procedure)).toEqual([
    "executeKestraDeployment",
  ]);
  expect(writes(state)[0].input.configuration).toMatchObject({
    osInstallation: { target_disk: "/dev/nvme0n1" },
    name: "Warehouse baseline",
    version: "2",
  });
});

test("provisioning uses its own review and flow without an installation acknowledgement", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/deployments?deviceId=device-a&step=provisioning");
  await page
    .getByRole("button", { name: "Review provisioning", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Provision device", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("fixture-execution");
  expect(writes(state).map((call) => call.procedure)).toEqual([
    "executeKestraDeployment",
  ]);
  expect(writes(state)[0].input).toMatchObject({
    device_id: "device-a",
    deployment_id: "device-a-v2",
    flow_type: "provisioning",
  });
});
