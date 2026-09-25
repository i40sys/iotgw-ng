import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faCheck, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useDeviceCode } from "@/hooks/use-device-code";
import { formatDuration } from "@/lib/utils";

interface DeviceTOTPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  networkId: string;
  domainId: string;
  deviceName: string;
}

export function DeviceTOTPDialog({
  open,
  onOpenChange,
  deviceId,
  networkId,
  domainId,
  deviceName,
}: DeviceTOTPDialogProps) {
  const [copied, setCopied] = useState(false);
  // The code comes from the backend (decision-033); it is only fetched while
  // the dialog is open.
  const {
    code: token,
    isNext,
    secondsLeft,
    progress,
    isLoading,
    error,
    reset,
    isResetting,
  } = useDeviceCode(deviceId, open);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Device one-time code</DialogTitle>
          <DialogDescription>
            Single-use code for {deviceName}. Type it on the gateway when it asks
            for one (VPN refresh, first SSH enrollment, live image).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-6">
          {/* Code Display */}
          <div className="flex items-center gap-3">
            <div className="bg-muted rounded-lg px-6 py-4 font-mono text-4xl font-bold tracking-wider">
              {token ? (
                <>
                  <span>{token.slice(0, 3)}</span>
                  <span className="text-muted-foreground mx-1">-</span>
                  <span>{token.slice(3, 6)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">------</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
              disabled={!token}
            >
              <FontAwesomeIcon
                icon={copied ? faCheck : faCopy}
                className="h-4 w-4"
                aria-hidden="true"
              />
              <span className="sr-only">Copy code</span>
            </Button>
          </div>

          {/* Timer Progress Bar */}
          <div className="w-full">
            <div className="bg-muted mb-2 h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                {isLoading
                  ? "Loading code…"
                  : token
                    ? `Valid for ${formatDuration(secondsLeft)}`
                    : "No code available"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={isResetting}
                className="h-auto px-2 py-1"
                title="Rotate this device's code seed: every earlier code stops working"
              >
                <FontAwesomeIcon
                  icon={faRotateRight}
                  className="mr-1 h-3 w-3"
                  aria-hidden="true"
                />
                <span className="text-xs">Reset code</span>
              </Button>
            </div>
            {isNext && (
              <p className="text-muted-foreground mt-2 text-xs">
                The current code was already used, so this is the next one. If it
                is refused too, use Reset code.
              </p>
            )}
            {error && (
              <p className="text-destructive mt-2 text-xs">
                Could not get the code: {error.message}
              </p>
            )}
          </div>

          {/* Device Info */}
          <div className="bg-muted/50 w-full rounded-lg p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Device:</span>
                <span className="font-mono">{deviceId.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network:</span>
                <span className="font-mono">{networkId.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Domain:</span>
                <span className="font-mono">{domainId.slice(0, 8)}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
