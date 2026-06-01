import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  DeviceSelectionPanel,
  type DeviceSelectionState,
  type DeviceWithDetails,
} from "@/components/devices";

export const Route = createFileRoute("/__test-device-selection")({
  component: TestDeviceSelectionPage,
});

function TestDeviceSelectionPage() {
  const [selectedDevice, setSelectedDevice] = useState<
    DeviceWithDetails | undefined
  >();
  const [selectionState, setSelectionState] = useState<DeviceSelectionState>(
    {},
  );

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="mb-4 text-2xl font-bold">Device Selection Panel Test</h1>
        <p className="text-muted-foreground mb-6">
          This is a test page for the DeviceSelectionPanel component to verify
          its functionality.
        </p>
      </div>

      <div className="max-w-4xl">
        <DeviceSelectionPanel
          onDeviceChange={setSelectedDevice}
          onSelectionStateChange={setSelectionState}
          className="mb-6"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">Selected Device</h2>
          <div className="text-sm">
            {selectedDevice ? (
              <div className="space-y-2">
                <div>
                  <strong>Name:</strong> {selectedDevice.name}
                </div>
                <div>
                  <strong>IP Address:</strong> {selectedDevice.ip_address}
                </div>
                <div>
                  <strong>ID:</strong> {selectedDevice.id}
                </div>
                {selectedDevice.description && (
                  <div>
                    <strong>Description:</strong> {selectedDevice.description}
                  </div>
                )}
                {selectedDevice.network && (
                  <div>
                    <strong>Network:</strong> {selectedDevice.network.name}
                  </div>
                )}
                {selectedDevice.network?.domain && (
                  <div>
                    <strong>Domain:</strong>{" "}
                    {selectedDevice.network.domain.display_name}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No device selected</p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">Selection State</h2>
          <div className="space-y-2 text-sm">
            <div>
              <strong>Domain Filter:</strong>{" "}
              {selectionState.domainFilter || "None"}
            </div>
            <div>
              <strong>Network Filter:</strong>{" "}
              {selectionState.networkFilter || "None"}
            </div>
            <div>
              <strong>Selected Device ID:</strong>{" "}
              {selectionState.selectedDevice?.id || "None"}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg border p-4">
        <h3 className="mb-2 font-medium">Component Features</h3>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
          <li>Domain filtering with cascade to network options</li>
          <li>Network filtering with cascade to device options</li>
          <li>Device selection with status display</li>
          <li>Clear filters functionality</li>
          <li>Real-time state management</li>
          <li>Proper loading states for API calls</li>
        </ul>
      </div>
    </div>
  );
}
