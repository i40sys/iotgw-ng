import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeviceTOTPDialog } from "./device-totp-dialog";

// decision-033: the browser never derives device codes; it shows whatever the
// backend's getDeviceCode returns and "Reset code" calls rotateDeviceCode.
interface DeviceCodeView {
  code: string;
  step: number;
  validUntil: string;
  next: boolean;
}

const getDeviceCode = vi.fn<(input: { id: string }) => Promise<DeviceCodeView>>();
const rotateDeviceCode = vi.fn<(input: { id: string }) => Promise<DeviceCodeView>>();

vi.mock("@/utils/trpc", () => ({
  trpc: {
    getDeviceCode: {
      queryKey: (input: { id: string }) => [["getDeviceCode"], { input }],
      queryOptions: (input: { id: string }) => ({
        queryKey: [["getDeviceCode"], { input }],
        queryFn: () => getDeviceCode(input),
      }),
    },
    rotateDeviceCode: {
      mutationOptions: () => ({
        mutationFn: (input: { id: string }) => rotateDeviceCode(input),
      }),
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const inMinutes = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const renderDialog = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeviceTOTPDialog
        open
        onOpenChange={vi.fn()}
        deviceId="550e8400-e29b-41d4-a716-446655440000"
        networkId="660e8400-e29b-41d4-a716-446655440001"
        domainId="770e8400-e29b-41d4-a716-446655440002"
        deviceName="gw-1"
      />
    </QueryClientProvider>,
  );

describe("DeviceTOTPDialog", () => {
  beforeEach(() => {
    getDeviceCode.mockReset();
    rotateDeviceCode.mockReset();
  });

  it("shows the backend's code and how long it stays valid", async () => {
    getDeviceCode.mockResolvedValue({
      code: "123456",
      step: 100,
      validUntil: inMinutes(15),
      next: false,
    });
    renderDialog();
    expect(await screen.findByText("123")).toBeTruthy();
    expect(screen.getByText("456")).toBeTruthy();
    expect(getDeviceCode).toHaveBeenCalledWith({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(screen.getByText(/^Valid for 1[45]m/)).toBeTruthy();
    expect(screen.queryByText(/already used/)).toBeNull();
  });

  it("says when it is showing the next code because the current one was used", async () => {
    getDeviceCode.mockResolvedValue({
      code: "654321",
      step: 101,
      validUntil: inMinutes(25),
      next: true,
    });
    renderDialog();
    expect(await screen.findByText("654")).toBeTruthy();
    expect(screen.getByText(/current code was already used/)).toBeTruthy();
  });

  it("Reset code rotates the seed and shows the new code", async () => {
    getDeviceCode.mockResolvedValue({
      code: "111111",
      step: 100,
      validUntil: inMinutes(15),
      next: false,
    });
    rotateDeviceCode.mockResolvedValue({
      code: "999888",
      step: 100,
      validUntil: inMinutes(15),
      next: false,
    });
    renderDialog();
    await screen.findAllByText("111");
    fireEvent.click(screen.getByRole("button", { name: /Reset code/ }));
    await waitFor(() => expect(screen.getByText("999")).toBeTruthy());
    expect(screen.getByText("888")).toBeTruthy();
    expect(rotateDeviceCode).toHaveBeenCalledWith({
      id: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});
