import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectivityCheckDialog, type ConnectivityProgressView } from "./connectivity-check-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const running: ConnectivityProgressView = {
  executionId: "15npFdM8RTX2k2gsndhdpA",
  finished: false,
  elapsedMs: 9_300,
  lastLog: "TASK [Ansible connectivity ping] ****",
  phases: [
    { id: "queued", label: "Queued in Kestra", status: "done", durationMs: 1_000 },
    { id: "runner", label: "Starting the runner pod", status: "done", durationMs: 1_300 },
    { id: "icmp", label: "ICMP ping from the Netmaker host", status: "done", durationMs: 3_500 },
    { id: "ssh", label: "SSH + Ansible through the bastion", status: "running", durationMs: 3_400 },
    { id: "done", label: "Collecting the results", status: "pending" },
  ],
  ping: { success: true, rawOutput: "", latency: 95.9 },
};

describe("ConnectivityCheckDialog progress", () => {
  it("shows what the check is waiting for, with timings and the live log line", () => {
    render(
      <ConnectivityCheckDialog
        open
        onOpenChange={() => {}}
        isChecking
        result={null}
        progress={running}
        deviceName="gw-c3"
        deviceIp="10.5.0.1"
      />,
    );
    expect(screen.getByText("deployments.connectivityCheck.progressTitle")).toBeTruthy();
    expect(screen.getByText("SSH + Ansible through the bastion")).toBeTruthy();
    expect(screen.getByLabelText("running")).toBeTruthy();
    expect(screen.getAllByLabelText("done")).toHaveLength(3);
    expect(screen.getByText("9.3 s")).toBeTruthy(); // total elapsed
    expect(screen.getByText("3.5 s")).toBeTruthy(); // ICMP phase duration
    expect(screen.getByText("TASK [Ansible connectivity ping] ****")).toBeTruthy();
    expect(screen.getByText("#15npFdM8RTX2k2gsndhdpA")).toBeTruthy();
  });

  it("shows the ICMP result as soon as it is known, before the check finishes", () => {
    render(
      <ConnectivityCheckDialog open onOpenChange={() => {}} isChecking result={null} progress={running} />,
    );
    expect(screen.getByText("deployments.connectivityCheck.latency")).toBeTruthy();
  });
});
