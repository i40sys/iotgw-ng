import { useState } from "react";
import { BootingLiveStep } from "@/components/deployment-steps/booting-live-step";
import { RebootingStep } from "@/components/deployment-steps/rebooting-step";
import { ConnectivityCheckDialog } from "@/components/connectivity-check-dialog";
import { useConnectivityCheck } from "@/hooks/use-connectivity-check";
import type { DeploymentDevice } from "@/lib/deployment-workspace";

/** Each stage owns its check: a live-USB result cannot become a reboot result. */
export function DeploymentConnectivityStage({
  device,
  isBoot,
}: {
  device: DeploymentDevice;
  isBoot: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const check = useConnectivityCheck();
  const props = {
    deviceId: device.id,
    onCheckConnectivity: () => {
      setIsOpen(true);
      check.run(device.id);
    },
    isCheckingConnectivity: check.isChecking,
    connectivityResult: check.result,
  };
  return (
    <>
      {isBoot ? (
        <BootingLiveStep
          {...props}
          deviceName={device.name}
          networkId={device.network_id ?? undefined}
        />
      ) : (
        <RebootingStep {...props} />
      )}
      <ConnectivityCheckDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        isChecking={check.isChecking}
        result={check.result}
        progress={check.progress}
        deviceName={device.name}
        deviceIp={device.ip_address ?? undefined}
        sshKeyId={device.ssh_key_id ?? null}
      />
    </>
  );
}
