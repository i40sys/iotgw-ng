import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Editor from "@monaco-editor/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

// Schema for OS installation form
const osInstallationSchema = z.object({
  openwrt_version: z.string().min(1, "OpenWRT version is required"),
  target_disk: z.string().min(1, "Target disk is required"),
});

type OsInstallationFormValues = z.infer<typeof osInstallationSchema>;

// Configuration subset for OS installation
interface OsInstallationConfig {
  osInstallation?: {
    openwrt_version?: string;
    target_disk?: string;
  };
}

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
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [localJsonValue, setLocalJsonValue] = useState(configurationJson);

  // Detect theme for Monaco editor
  useEffect(() => {
    const checkDarkMode = () => {
      const root = window.document.documentElement;
      setIsDarkMode(root.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(window.document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Extract OS installation values from configuration JSON
  const extractOsInstallationValues = useCallback(
    (json: string): OsInstallationFormValues => {
      try {
        const config = JSON.parse(json) as OsInstallationConfig;
        return {
          openwrt_version: config.osInstallation?.openwrt_version ?? "23.05.4",
          target_disk: config.osInstallation?.target_disk ?? "/dev/nvme0n1",
        };
      } catch {
        return {
          openwrt_version: "23.05.4",
          target_disk: "/dev/nvme0n1",
        };
      }
    },
    []
  );

  // Initialize form with values from configuration JSON
  const form = useForm<OsInstallationFormValues>({
    resolver: zodResolver(osInstallationSchema),
    defaultValues: extractOsInstallationValues(configurationJson),
  });

  // Update form when configuration JSON changes externally (e.g., version switch)
  useEffect(() => {
    const values = extractOsInstallationValues(configurationJson);
    form.reset(values);
    setLocalJsonValue(configurationJson);
  }, [configurationJson, form, extractOsInstallationValues]);

  // Update configuration JSON when form values change
  const updateConfigurationFromForm = useCallback(
    (values: OsInstallationFormValues) => {
      try {
        const config = JSON.parse(configurationJson) as OsInstallationConfig;
        const updatedConfig: OsInstallationConfig = {
          ...config,
          osInstallation: {
            ...config.osInstallation,
            openwrt_version: values.openwrt_version,
            target_disk: values.target_disk,
          },
        };
        const newJson = JSON.stringify(updatedConfig, null, 2);
        setLocalJsonValue(newJson);
        onConfigurationChange(newJson);
      } catch {
        // If JSON is invalid, create a new object with OS installation values
        const newConfig = {
          osInstallation: {
            openwrt_version: values.openwrt_version,
            target_disk: values.target_disk,
          },
        };
        const newJson = JSON.stringify(newConfig, null, 2);
        setLocalJsonValue(newJson);
        onConfigurationChange(newJson);
      }
    },
    [configurationJson, onConfigurationChange]
  );

  // Handle mode toggle
  const handleModeToggle = (checked: boolean) => {
    if (checked) {
      // Switching to JSON mode - sync form values to JSON first
      updateConfigurationFromForm(form.getValues());
    } else {
      // Switching to form mode - sync JSON values to form
      const values = extractOsInstallationValues(localJsonValue);
      form.reset(values);
      onConfigurationChange(localJsonValue);
    }
    setIsJsonMode(checked);
    onModeChange?.(checked);
  };

  // Handle JSON editor changes
  const handleJsonChange = (value: string | undefined) => {
    if (value !== undefined) {
      setLocalJsonValue(value);
      // Only propagate valid JSON
      try {
        JSON.parse(value);
        onConfigurationChange(value);
      } catch {
        // Invalid JSON, don't propagate but keep local value for editing
      }
    }
  };

  // Watch form values and sync to JSON
  useEffect(() => {
    const subscription = form.watch((values) => {
      if (!isJsonMode && values.openwrt_version && values.target_disk) {
        updateConfigurationFromForm(values as OsInstallationFormValues);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, isJsonMode, updateConfigurationFromForm]);

  return (
    <div className="space-y-6">
      {/* FORM/JSON Toggle */}
      <div className="flex items-center justify-end gap-3">
        <Label
          htmlFor="mode-toggle"
          className={!isJsonMode ? "font-semibold" : "text-muted-foreground"}
        >
          {t("deployments.steps.formMode")}
        </Label>
        <Switch
          id="mode-toggle"
          checked={isJsonMode}
          onCheckedChange={handleModeToggle}
        />
        <Label
          htmlFor="mode-toggle"
          className={isJsonMode ? "font-semibold" : "text-muted-foreground"}
        >
          {t("deployments.steps.jsonMode")}
        </Label>
      </div>

      {isJsonMode ? (
        // JSON Editor Mode
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border">
            <Editor
              height="400px"
              language="json"
              theme={isDarkMode ? "vs-dark" : "light"}
              value={localJsonValue}
              onChange={handleJsonChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: "on",
                readOnly: false,
                domReadOnly: false,
                formatOnType: false,
                formatOnPaste: false,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                insertSpaces: true,
              }}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            {t("deployments.steps.jsonModeDescription")}
          </p>
        </div>
      ) : (
        // Form Mode
        <Form {...form}>
          <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* OpenWRT Version Field */}
              <FormField
                control={form.control}
                name="openwrt_version"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("deployments.steps.openwrtVersion")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="23.05.4"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("deployments.steps.openwrtVersionDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Target Disk Field */}
              <FormField
                control={form.control}
                name="target_disk"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("deployments.steps.targetDisk")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="/dev/nvme0n1"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("deployments.steps.targetDiskDescription")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                        <TableHead>
                          {t("deployments.steps.usageColumn")}
                        </TableHead>
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
          </div>
        </Form>
      )}
    </div>
  );
}
