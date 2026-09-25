import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigStepEditor } from "./config-step-editor";
import type { DeploymentConfigStep } from "@/lib/deployment-config-form";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Monaco does not run in jsdom; a textarea stands in for the JSON view.
vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string | undefined) => void;
  }) => (
    <textarea
      data-testid="json-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

beforeAll(() => {
  // Radix Switch measures itself.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const initialConfig = {
  osInstallation: { openwrt_version: "23.05.4", target_disk: "/dev/sda" },
  target_ip: "10.0.0.10",
  some_unknown_key: { nested: [1, 2, 3] },
  iotgw_hostname: "gw-1",
  mqtt: false,
};

function Harness({
  step,
  onJson,
}: {
  step: DeploymentConfigStep;
  onJson: (json: string) => void;
}) {
  const [json, setJson] = useState(JSON.stringify(initialConfig, null, 2));
  return (
    <ConfigStepEditor
      step={step}
      configurationJson={json}
      onConfigurationChange={(next) => {
        setJson(next);
        onJson(next);
      }}
    />
  );
}

const lastConfig = (spy: ReturnType<typeof vi.fn>) =>
  JSON.parse(spy.mock.calls.at(-1)![0] as string);

describe("ConfigStepEditor (schema-driven)", () => {
  it("renders only the provisioning step's fields", () => {
    render(<Harness step="provisioning" onJson={vi.fn()} />);
    expect(screen.getByTestId("field-iotgw_hostname")).toBeTruthy();
    expect(screen.getByTestId("field-primary_ntp")).toBeTruthy();
    expect(screen.getByTestId("schema-group-mqtt")).toBeTruthy();
    // Other step, backend-injected and legacy keys are not form fields.
    expect(screen.queryByTestId("field-osInstallation.target_disk")).toBeNull();
    expect(screen.queryByTestId("field-target_ip")).toBeNull();
    expect(screen.queryByTestId("field-name")).toBeNull();
  });

  it("renders the O.S. Installation step from the same schema", () => {
    render(<Harness step="os-installation" onJson={vi.fn()} />);
    const disk = within(
      screen.getByTestId("field-osInstallation.target_disk"),
    ).getByRole("textbox") as HTMLInputElement;
    expect(disk.value).toBe("/dev/sda");
    expect(screen.queryByTestId("field-iotgw_hostname")).toBeNull();
  });

  it("renders secrets as password inputs with a show/hide toggle", () => {
    render(<Harness step="provisioning" onJson={vi.fn()} />);
    const field = screen.getByTestId("field-root_password");
    const input = field.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(
      within(field).getByRole("button", {
        name: "deployments.steps.config.showSecret",
      }),
    );
    expect(input.type).toBe("text");
  });

  it("keeps every other key when a form field changes (and stores defaults)", () => {
    const onJson = vi.fn();
    render(<Harness step="provisioning" onJson={onJson} />);
    const hostname = screen
      .getByTestId("field-iotgw_hostname")
      .querySelector("input") as HTMLInputElement;
    fireEvent.change(hostname, { target: { value: "gw-2" } });

    const config = lastConfig(onJson);
    expect(config).toMatchObject({
      ...initialConfig,
      iotgw_hostname: "gw-2",
      // schema defaults of the step become explicit on the first edit
      firewall: true,
      primary_ntp: "0.openwrt.pool.ntp.org",
    });
    expect(config.mqtt).toBe(false);
  });

  it("hides a disabled stack's fields and shows them when it is switched on", () => {
    const onJson = vi.fn();
    render(<Harness step="provisioning" onJson={onJson} />);
    expect(screen.queryByTestId("field-iiot_host")).toBeNull();

    fireEvent.click(
      screen.getByRole("switch", { name: "MQTT (mosquitto + EMQX bridge)" }),
    );
    expect(lastConfig(onJson).mqtt).toBe(true);
    expect(screen.getByTestId("field-iiot_host")).toBeTruthy();
    // ...and now it is required.
    expect(
      within(screen.getByTestId("field-iiot_host")).getByText(
        "is required when `mqtt` is enabled",
      ),
    ).toBeTruthy();
  });

  it("round-trips Form → JSON → Form without losing keys", () => {
    const onJson = vi.fn();
    render(<Harness step="provisioning" onJson={onJson} />);
    const toggle = screen.getByRole("switch", {
      name: "deployments.steps.config.toggleJson",
    });

    fireEvent.click(toggle); // → JSON
    const editor = screen.getByTestId("json-editor") as HTMLTextAreaElement;
    // The JSON view is the whole document.
    expect(JSON.parse(editor.value)).toEqual(initialConfig);

    const edited = { ...JSON.parse(editor.value), iotgw_hostname: "from-json" };
    fireEvent.change(editor, { target: { value: JSON.stringify(edited) } });
    // Invalid JSON is kept in the editor but never propagated.
    const calls = onJson.mock.calls.length;
    fireEvent.change(editor, { target: { value: "{ broken" } });
    expect(onJson.mock.calls.length).toBe(calls);

    fireEvent.click(toggle); // → Form (drops the unparsable draft)
    const hostname = screen
      .getByTestId("field-iotgw_hostname")
      .querySelector("input") as HTMLInputElement;
    expect(hostname.value).toBe("from-json");
    expect(lastConfig(onJson)).toEqual(edited);
  });

  it("adds and removes rows of an array of objects", () => {
    const onJson = vi.fn();
    render(<Harness step="provisioning" onJson={onJson} />);
    const field = screen.getByTestId("field-dhcp_hosts");
    fireEvent.click(
      within(field).getByRole("button", {
        name: "deployments.steps.config.addRow",
      }),
    );
    expect(lastConfig(onJson).dhcp_hosts).toEqual([
      { name: "", ip: "", mac: "" },
    ]);
    fireEvent.change(within(field).getByLabelText("MAC 1"), {
      target: { value: "00:00:5E:00:53:01" },
    });
    expect(lastConfig(onJson).dhcp_hosts[0].mac).toBe("00:00:5E:00:53:01");
    fireEvent.click(
      within(field).getByRole("button", {
        name: "deployments.steps.config.removeRow",
      }),
    );
    expect(lastConfig(onJson).dhcp_hosts).toEqual([]);
  });
});
