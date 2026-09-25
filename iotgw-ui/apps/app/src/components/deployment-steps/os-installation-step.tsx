import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
  faCircleQuestion,
} from "@fortawesome/free-solid-svg-icons";
import { ConfigStepEditor } from "./config-step-editor";

// Step 2 — its fields (osInstallation.openwrt_version / target_disk) come
// from the same deployment-config JSON Schema as Provisioning (x-step
// "os-installation"); only the disk reference table is step-specific.

interface OsInstallationStepProps {
  configurationJson: string;
  onConfigurationChange: (json: string) => void;
  onModeChange?: (isJsonMode: boolean) => void;
}

// Target disk reference data
const TARGET_DISK_REFERENCE = [
  { device: "/dev/sda", usage: "Legacy SCSI/SATA, some VMs" },
  { device: "/dev/nvme0n1", usage: "NVMe PCIe SSD" },
  { device: "/dev/mmcblk0", usage: "eMMC storage" },
  { device: "/dev/vda", usage: "KVM/QEMU virtio" },
  { device: "/dev/xvda", usage: "Xen paravirtualized" },
  { device: "/dev/hda", usage: "Legacy IDE/PATA" },
];

export function OsInstallationStep({
  configurationJson,
  onConfigurationChange,
  onModeChange,
}: OsInstallationStepProps) {
  const { t } = useTranslation();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <ConfigStepEditor
      step="os-installation"
      configurationJson={configurationJson}
      onConfigurationChange={onConfigurationChange}
      onModeChange={onModeChange}
    >
      {/* Help Section - Target Disk Reference Table */}
      <Collapsible open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground gap-2"
          >
            <FontAwesomeIcon
              icon={faCircleQuestion}
              className="h-4 w-4"
              aria-hidden="true"
            />
            {t("deployments.steps.targetDiskHelp")}
            <FontAwesomeIcon
              icon={isHelpOpen ? faChevronUp : faChevronDown}
              className="h-3 w-3"
              aria-hidden="true"
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="bg-muted/50 rounded-lg border p-4">
            <h4 className="mb-3 text-sm font-semibold">
              {t("deployments.steps.targetDiskReferenceTitle")}
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">
                    {t("deployments.steps.deviceColumn")}
                  </TableHead>
                  <TableHead>{t("deployments.steps.usageColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {TARGET_DISK_REFERENCE.map((row) => (
                  <TableRow key={row.device}>
                    <TableCell className="font-mono font-medium">
                      {row.device}
                    </TableCell>
                    <TableCell>{row.usage}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </ConfigStepEditor>
  );
}
