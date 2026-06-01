import { useState, useEffect } from "react";
import * as OTPAuth from "otpauth";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

interface DeviceTOTPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  networkId: string;
  domainId: string;
  deviceName: string;
  totpCounter: number;
}

export function DeviceTOTPDialog({
  open,
  onOpenChange,
  deviceId,
  networkId,
  domainId,
  deviceName,
  totpCounter,
}: DeviceTOTPDialogProps) {
  const [token, setToken] = useState<string>("");
  const [timeRemaining, setTimeRemaining] = useState<number>(600);
  const [copied, setCopied] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [currentCounter, setCurrentCounter] = useState<number>(totpCounter);
  const queryClient = useQueryClient();

  const incrementCounterMutation = useMutation({
    ...trpc.incrementTotpCounter.mutationOptions(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: trpc.getDevices.queryKey(),
      });
      // Update local counter state immediately
      setCurrentCounter(data.totp_counter);
      setStartTime(Math.floor(Date.now() / 1000));
      toast.success("TOTP code regenerated with 10 minutes");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reset TOTP");
    },
  });

  // Sync currentCounter when totpCounter prop changes
  useEffect(() => {
    setCurrentCounter(totpCounter);
  }, [totpCounter]);

  // Auto-increment counter when timer expires
  useEffect(() => {
    if (timeRemaining === 0 && open && !incrementCounterMutation.isPending) {
      incrementCounterMutation.mutate({ id: deviceId });
    }
  }, [timeRemaining, open, incrementCounterMutation.isPending, deviceId]);

  useEffect(() => {
    if (!open) return;

    // Create a secret from device, network, and domain IDs
    // Add currentCounter from state to make each reset generate a different code
    const combinedSecret = `${domainId}-${networkId}-${deviceId}-${currentCounter}`;

    // Convert the combined secret to a buffer and then to base32
    // We'll use a simple approach: hash the string and encode to base32
    const encoder = new TextEncoder();
    const data = encoder.encode(combinedSecret);

    // Create base32 secret using OTPAuth's Secret class
    const secret = new OTPAuth.Secret({ buffer: data });

    // If startTime is 0, initialize it to current time
    const initialStartTime = startTime || Math.floor(Date.now() / 1000);
    if (startTime === 0) {
      setStartTime(initialStartTime);
    }

    // Create TOTP instance with custom timestamp
    const totp = new OTPAuth.TOTP({
      issuer: "IoTGW",
      label: deviceName,
      algorithm: "SHA1",
      digits: 6,
      period: 600,
      secret: secret,
    });

    const updateToken = () => {
      // Use the startTime as the base for calculation
      const currentToken = totp.generate({ timestamp: startTime * 1000 });
      setToken(currentToken);

      // Calculate time remaining based on elapsed time since start
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - startTime;
      const remaining = Math.max(0, 600 - elapsed);
      setTimeRemaining(remaining);
    };

    // Initial update
    updateToken();

    // Update every second
    const interval = setInterval(updateToken, 1000);

    return () => clearInterval(interval);
  }, [open, deviceId, networkId, domainId, deviceName, startTime, currentCounter]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success("TOTP code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleReset = () => {
    incrementCounterMutation.mutate({ id: deviceId });
  };

  // Calculate progress percentage
  const progress = (timeRemaining / 600) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Device TOTP</DialogTitle>
          <DialogDescription>
            Time-based One-Time Password for {deviceName}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-6">
          {/* TOTP Code Display */}
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
              onClick={handleCopy}
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
                Refreshes in {timeRemaining}s
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-auto px-2 py-1"
              >
                <FontAwesomeIcon
                  icon={faRotateRight}
                  className="mr-1 h-3 w-3"
                  aria-hidden="true"
                />
                <span className="text-xs">Reset</span>
              </Button>
            </div>
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
