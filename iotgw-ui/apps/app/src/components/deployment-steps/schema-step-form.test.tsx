import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { SchemaStepForm } from "./schema-step-form";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeAll(() => {
  // Radix Switch measures itself.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const renderProvisioning = (config: Record<string, unknown>) =>
  render(
    <SchemaStepForm
      step="provisioning"
      config={config}
      onChange={() => {}}
      errors={new Map()}
    />,
  );

describe("SchemaStepForm — Uptime Kuma admin account", () => {
  it("asks for the admin user and a hidden password when the stack is on", () => {
    const { container } = renderProvisioning({ uptime_kuma: true });
    expect(container.querySelector("#cfg-autokuma_username")).not.toBeNull();
    const password = container.querySelector<HTMLInputElement>(
      "#cfg-autokuma_password",
    );
    expect(password).not.toBeNull();
    expect(password?.type).toBe("password");
  });

  it("hides the account fields while the stack is off", () => {
    const { container } = renderProvisioning({ uptime_kuma: false });
    expect(container.querySelector("#cfg-autokuma_password")).toBeNull();
  });
});
