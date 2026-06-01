import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ErrorDisplay } from "@/components/ui/error-display";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Editor from "@monaco-editor/react";
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useDeploymentSettings } from "@/hooks/use-deployment-settings";
import { trpc } from "@/utils/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUpload,
  faServer,
  faGear,
  faFileLines,
  faDice,
  faRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { VersionListPanel } from "@/components/version-list-panel";
import { DeploymentActionsPanel } from "@/components/deployment-actions-panel";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";
import { DeploymentJobsList } from "@/components/deployment-jobs-list";
import {
  DeploymentStepTabs,
  DeploymentStepContent,
  type DeploymentStep,
} from "@/components/deployment-step-tabs";
import { BootingLiveStep } from "@/components/deployment-steps/booting-live-step";
import { OsInstallationStep } from "@/components/deployment-steps/os-installation-step";
import { RebootingStep } from "@/components/deployment-steps/rebooting-step";
import {
  defaultDeploymentConfig,
  deploymentConfigSchema,
} from "@/schemas/deployment-config";
import { generateRandomDeploymentName } from "@/utils/random-names";
import { toast } from "sonner";
import { DeploymentStatusDialog } from "@/components/deployment-status-dialog";
import { ConnectivityCheckDialog } from "@/components/connectivity-check-dialog";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
const deploymentsSearchSchema = z.object({
  deviceId: z.string().optional(),
  networkId: z.string().optional(),
  domainId: z.string().optional(),
});

export const Route = createFileRoute("/deployments/")({
  errorComponent: ({ error }) => (
    <ErrorDisplay
      error={error instanceof Error ? error : new Error("Unknown error")}
    />
  ),
  pendingComponent: () => <LoadingSpinner />,
  validateSearch: deploymentsSearchSchema,
  component: DeploymentsPage,
});

interface DeploymentFormData {
  name: string;
  description: string;
  configurationJson: string;
  isConfigValid: boolean;
}

interface DeploymentVersion {
  id: string;
  name: string;
  description: string | null;
  version: string;
  modified_at: string;
  device_id: string | null;
  configuration?: any; // May be included when fetching full details
}

function DeploymentsPage() {
  const { t } = useTranslation();
  const { deviceId, networkId, domainId } = Route.useSearch();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<{
    open: boolean;
    executionId?: string;
    flowId?: string;
    status: "RUNNING" | "SUCCESS" | "FAILED" | "PENDING";
    startedAt?: string;
    completedAt?: string;
    message?: string;
  }>({
    open: false,
    status: "PENDING",
  });
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null,
  );

  // Load persisted deployment settings from localStorage
  const { settings: persistedSettings, updateSettings: persistSettings } =
    useDeploymentSettings();
  const isInitialMount = useRef(true);

  // Detect theme for Monaco editor
  React.useEffect(() => {
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

  // Use URL params if provided, otherwise fall back to persisted settings
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(
    deviceId || persistedSettings.selectedDeviceId,
  );
  const [selectedDomainId, setSelectedDomainId] = useState<string | undefined>(
    domainId || persistedSettings.selectedDomainId,
  );
  const [selectedNetworkId, setSelectedNetworkId] = useState<
    string | undefined
  >(networkId || persistedSettings.selectedNetworkId);
  const [selectedVersion, setSelectedVersion] = useState<
    DeploymentVersion | undefined
  >(persistedSettings.selectedVersion);
  const [isLoading, setIsLoading] = useState(false);
  const [originalFormData, setOriginalFormData] =
    useState<DeploymentFormData>();
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] =
    useState(false);
  const [dialogMode, setDialogMode] = useState<
    "device-change" | "version-change" | "navigation"
  >("navigation");
  const [pendingDeviceId, setPendingDeviceId] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<
    (() => void | Promise<void>) | null
  >(null);

  const queryClient = useQueryClient();

  // Queries
  const domainsQuery = useQuery(trpc.getDomains.queryOptions());
  const networksQuery = useQuery({
    ...trpc.getNetworks.queryOptions(),
    select: (data) =>
      selectedDomainId
        ? data?.filter((network) => network.domain_id === selectedDomainId)
        : data,
  });
  const devicesQuery = useQuery({
    ...trpc.getDevicesFiltered.queryOptions({
      domain_id: selectedDomainId,
      network_id: selectedNetworkId,
    }),
  });
  const selectedDevice = React.useMemo(
    () => devicesQuery.data?.find((device) => device.id === selectedDeviceId),
    [devicesQuery.data, selectedDeviceId],
  );
  const createDeploymentMutation = useMutation({
    ...trpc.createDeployment.mutationOptions(),
  });

  const updateDeploymentMutation = useMutation({
    ...trpc.updateDeployment.mutationOptions(),
  });

  const deleteDeploymentMutation = useMutation({
    ...trpc.deleteDeployment.mutationOptions(),
  });

  const executeKestraDeploymentMutation = useMutation({
    ...trpc.executeKestraDeployment.mutationOptions(),
  });

  // Function to check execution status
  const checkExecutionStatus = React.useCallback(
    async (executionId: string, flowId?: string) => {
      try {
        const statusData = await queryClient.fetchQuery(
          trpc.checkKestraExecutionStatus.queryOptions({
            execution_id: executionId,
            flow_id: flowId,
          }),
        );

        setDeploymentStatus((prev) => ({
          ...prev,
          status: statusData.status,
          startedAt: statusData.startedAt,
          completedAt: statusData.completedAt,
          message: statusData.message,
        }));

        // Stop polling if execution is complete (SUCCESS or FAILED)
        if (statusData.status === "SUCCESS" || statusData.status === "FAILED") {
          // Clear the interval to stop polling
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }

          // Show appropriate toast message
          if (statusData.status === "SUCCESS") {
            toast.success("Deployment completed successfully");
          } else {
            toast.error(statusData.message || "Deployment failed");
          }

          // Return true to indicate polling should stop
          return { ...statusData, shouldStopPolling: true };
        }

        return statusData;
      } catch (error) {
        console.error("Failed to check execution status:", error);
        // Continue polling even if there's an error
        return null;
      }
    },
    [queryClient, pollingInterval],
  );

  // Start polling when deployment starts
  const startStatusPolling = React.useCallback(
    (executionId: string, flowId?: string) => {
      // Clear any existing interval
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }

      // Start polling every 1 second
      const interval = setInterval(async () => {
        const result = await checkExecutionStatus(executionId, flowId);
        // If the status indicates we should stop polling, clear the interval
        if (
          result &&
          "shouldStopPolling" in result &&
          result.shouldStopPolling
        ) {
          clearInterval(interval);
          setPollingInterval(null);
        }
      }, 1000);

      setPollingInterval(interval);

      // Check status immediately
      checkExecutionStatus(executionId, flowId);
    },
    [checkExecutionStatus, pollingInterval],
  );

  // Clean up polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const initialFormData: DeploymentFormData = {
    name: "",
    description: "",
    configurationJson: JSON.stringify(defaultDeploymentConfig, null, 2),
    isConfigValid: true,
  };

  // Initialize form data from persisted settings if available
  const [formData, setFormData] = useState<DeploymentFormData>(() => {
    if (persistedSettings.formName || persistedSettings.configurationJson) {
      return {
        name: persistedSettings.formName || "",
        description: persistedSettings.formDescription || "",
        configurationJson:
          persistedSettings.configurationJson ||
          JSON.stringify(defaultDeploymentConfig, null, 2),
        isConfigValid: true,
      };
    }
    return initialFormData;
  });

  // Initialize originalFormData when component mounts
  React.useEffect(() => {
    if (!originalFormData) {
      setOriginalFormData(initialFormData);
    }
  }, [originalFormData]);

  // Auto-load versions and configuration when coming from URL params
  React.useEffect(() => {
    if (deviceId && !selectedVersion) {
      // Fetch versions for the device
      queryClient
        .fetchQuery(
          trpc.getDeploymentVersions.queryOptions({ device_id: deviceId }),
        )
        .then((versions) => {
          if (versions && versions.length > 0) {
            // Sort by version number descending to get the latest
            const sortedVersions = [...versions].sort(
              (a, b) => b.version - a.version,
            );
            const latestVersion = sortedVersions[0];
            // Automatically select and load the latest version
            handleVersionSelect(latestVersion);
          } else {
            // No versions exist, load default configuration
            const defaultVersion = {
              id: "default",
              name: "Default Configuration",
              description: "Default deployment configuration template",
              version: "0",
              modified_at: new Date().toISOString(),
              device_id: deviceId,
            };
            handleVersionSelect(defaultVersion);
          }
        })
        .catch((error) => {
          console.error("Failed to load versions:", error);
          // On error, also load default configuration
          const defaultVersion = {
            id: "default",
            name: "Default Configuration",
            description: "Default deployment configuration template",
            version: "0",
            modified_at: new Date().toISOString(),
            device_id: deviceId,
          };
          handleVersionSelect(defaultVersion);
        });
    }
  }, [deviceId, selectedVersion, queryClient]);

  // Check if form has unsaved changes
  const hasUnsavedChanges = originalFormData
    ? formData.name !== originalFormData.name ||
      formData.description !== originalFormData.description ||
      formData.configurationJson !== originalFormData.configurationJson
    : false;

  // Navigation guard for unsaved changes
  useNavigationGuard({
    hasUnsavedChanges,
    onNavigationBlocked: () => {
      setDialogMode("navigation");
      setShowUnsavedChangesDialog(true);
    },
  });

  const handleJsonChange = (value: string | undefined) => {
    if (value !== undefined) {
      setFormData({ ...formData, configurationJson: value });
      // Basic JSON validation
      try {
        JSON.parse(value);
        setFormData((prev) => ({ ...prev, isConfigValid: true }));
      } catch {
        setFormData((prev) => ({ ...prev, isConfigValid: false }));
      }
    }
  };

  const loadFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          JSON.parse(content); // Validate JSON
          setFormData({ ...formData, configurationJson: content });
          toast.success("Configuration loaded from file successfully");
        } catch (error) {
          toast.error("Invalid JSON file selected");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.isConfigValid) {
      toast.error("Please fix configuration errors before deploying");
      return;
    }

    try {
      // Validate the JSON configuration with Zod schema
      const configObject = JSON.parse(formData.configurationJson);
      deploymentConfigSchema.parse(configObject);

      // TODO: Implement deployment submission logic
      console.log("Deployment form data:", {
        ...formData,
        configurationObject: configObject,
      });

      toast.success("Deployment configuration validated successfully");
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON in configuration");
      } else {
        toast.error("Configuration validation failed");
      }
    }
  };

  const handleVersionSelect = async (version: DeploymentVersion) => {
    const loadVersionConfiguration = async () => {
      setSelectedVersion(version);

      if (version.id === "default") {
        // Load default configuration
        const defaultConfig = JSON.stringify(defaultDeploymentConfig, null, 2);
        setFormData({
          name: "Default Configuration",
          description: "Default deployment configuration template",
          configurationJson: defaultConfig,
          isConfigValid: true,
        });
        setOriginalFormData({
          name: "Default Configuration",
          description: "Default deployment configuration template",
          configurationJson: defaultConfig,
          isConfigValid: true,
        });
      } else {
        // Try to get the deployment configuration from the backend
        try {
          const deployment = await queryClient.fetchQuery(
            trpc.getDeployment.queryOptions({
              id: version.id,
            }),
          );

          if (deployment && deployment.configuration) {
            const configJson =
              typeof deployment.configuration === "string"
                ? deployment.configuration
                : JSON.stringify(deployment.configuration, null, 2);

            setFormData({
              name:
                deployment.name || version.name || `Version ${version.version}`,
              description: deployment.description || version.description || "",
              configurationJson: configJson,
              isConfigValid: true,
            });
            setOriginalFormData({
              name:
                deployment.name || version.name || `Version ${version.version}`,
              description: deployment.description || version.description || "",
              configurationJson: configJson,
              isConfigValid: true,
            });
          } else {
            // If no configuration found, use default
            const defaultConfig = JSON.stringify(
              defaultDeploymentConfig,
              null,
              2,
            );
            setFormData({
              name: version.name || `Version ${version.version}`,
              description: version.description || "",
              configurationJson: defaultConfig,
              isConfigValid: true,
            });
            setOriginalFormData({
              name: version.name || `Version ${version.version}`,
              description: version.description || "",
              configurationJson: defaultConfig,
              isConfigValid: true,
            });
            toast.info(
              "No configuration found for this version, using default",
            );
          }
        } catch (error) {
          console.error("Error loading deployment configuration:", error);
          toast.error("Failed to load version configuration");
        }
      }
    };

    if (hasUnsavedChanges) {
      setPendingAction(() => loadVersionConfiguration());
      setDialogMode("version-change");
      setShowUnsavedChangesDialog(true);
    } else {
      await loadVersionConfiguration();
    }
  };

  const handleReset = () => {
    // Reset all selections
    setSelectedDeviceId(undefined);
    setSelectedDomainId(undefined);
    setSelectedNetworkId(undefined);
    setSelectedVersion(undefined);

    // Reset form data to initial defaults
    setFormData(initialFormData);
    setOriginalFormData(initialFormData);

    // Reset UI state - explicitly set each value
    setActiveDeploymentStep("booting-live");
    setIsVersionsPanelCollapsed(true);
    // Expand both 'basic-info' and 'configuration' panes
    setAccordionValue(["basic-info", "configuration"]);

    // Clear localStorage after state is set (will be re-saved by useEffect with new values)
    try {
      window.localStorage.removeItem("iotgw-deployment-settings");
    } catch (error) {
      console.warn("Error clearing localStorage:", error);
    }

    toast.success("All settings have been reset");
  };

  const handleNewVersion = async () => {
    if (!selectedDeviceId) {
      toast.error("Please select a device before creating a new version");
      return;
    }

    setIsLoading(true);
    try {
      // Parse the JSON configuration
      const configObject = JSON.parse(formData.configurationJson);

      // Get existing versions to determine the next version number
      const existingVersions = queryClient.getQueryData(
        trpc.getDeploymentVersions.queryKey({ device_id: selectedDeviceId }),
      );

      // Find the highest version number by parsing version strings
      let nextVersionNumber = 1;
      if (existingVersions && existingVersions.length > 0) {
        const versionNumbers = existingVersions
          .map((v) => parseInt(v.version, 10))
          .filter((n) => !isNaN(n));
        if (versionNumbers.length > 0) {
          const maxVersion = Math.max(...versionNumbers);
          nextVersionNumber = maxVersion + 1;
        }
      }

      // Use random name if no name is provided
      const versionName =
        formData.name.trim() || generateRandomDeploymentName();

      // Ensure name and version exist in the configuration object
      if (!configObject.name) {
        configObject.name = versionName;
      }
      if (!configObject.version) {
        configObject.version = String(nextVersionNumber);
      }

      // Validate the configuration with Zod schema
      deploymentConfigSchema.parse(configObject);

      // Create the new deployment in the backend
      const result = await createDeploymentMutation.mutateAsync({
        device_id: selectedDeviceId,
        name: versionName,
        description: formData.description || null,
        configuration: configObject,
        version: String(nextVersionNumber),
      });

      // Invalidate the versions query to refresh the list
      await queryClient.invalidateQueries({
        queryKey: trpc.getDeploymentVersions.queryKey({
          device_id: selectedDeviceId,
        }),
      });

      // Update local state with the new version (use result from backend)
      const newVersionData: DeploymentVersion = {
        id: result.id,
        name: result.name || versionName,
        version: String(nextVersionNumber),
        modified_at: result.modified_at || new Date().toISOString(),
        device_id: selectedDeviceId,
        description: result.description ?? null,
      };

      setSelectedVersion(newVersionData);
      // Mark as saved with updated config
      const updatedConfigJson = JSON.stringify(configObject, null, 2);
      setOriginalFormData({
        ...formData,
        configurationJson: updatedConfigJson,
      });
      toast.success(`Created new version: v${nextVersionNumber}`);
    } catch (error) {
      toast.error("Failed to create new version");
      console.error("Error creating new version:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.isConfigValid) {
      toast.error("Please fix configuration errors before saving");
      return;
    }

    if (!selectedDeviceId) {
      toast.error("Please select a device before saving");
      return;
    }

    // If saving default version, create a new version instead
    if (!selectedVersion || selectedVersion.id === "default") {
      await handleNewVersion();
      return;
    }

    setIsLoading(true);
    try {
      // Parse the JSON configuration
      const configObject = JSON.parse(formData.configurationJson);

      // Ensure name and version exist in the configuration object
      if (!configObject.name) {
        configObject.name =
          formData.name.trim() || generateRandomDeploymentName();
      }
      if (!configObject.version) {
        configObject.version = selectedVersion?.version || "1.0.0";
      }

      // Validate the configuration with Zod schema
      deploymentConfigSchema.parse(configObject);

      // Use random name if no name is provided for the deployment record
      const deploymentName =
        formData.name.trim() || generateRandomDeploymentName();

      // Update the existing deployment
      await updateDeploymentMutation.mutateAsync({
        id: selectedVersion.id,
        name: deploymentName,
        description: formData.description || null,
        device_id: selectedDeviceId,
        configuration: configObject,
      });

      // Update original form data to reflect saved state with updated config
      setOriginalFormData({
        ...formData,
        configurationJson: JSON.stringify(configObject, null, 2),
      });

      // Invalidate the versions query to refresh the list
      await queryClient.invalidateQueries({
        queryKey: trpc.getDeploymentVersions.queryKey({
          device_id: selectedDeviceId,
        }),
      });

      toast.success(`Version ${selectedVersion.version} updated successfully`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON in configuration");
      } else {
        toast.error("Failed to save configuration");
        console.error("Error saving deployment:", error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedVersion || selectedVersion.id === "default") {
      toast.error("Cannot delete the default configuration");
      return;
    }

    if (!selectedDeviceId) {
      toast.error("Please select a device");
      return;
    }

    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete version ${selectedVersion.version}? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    try {
      await deleteDeploymentMutation.mutateAsync({
        id: selectedVersion.id,
      });

      // Invalidate the versions query to refresh the list
      await queryClient.invalidateQueries({
        queryKey: trpc.getDeploymentVersions.queryKey({
          device_id: selectedDeviceId,
        }),
      });

      // Reset to default version after deletion
      setSelectedVersion(undefined);
      const defaultConfig = JSON.stringify(defaultDeploymentConfig, null, 2);
      setFormData({
        name: "Default Configuration",
        description: "Default deployment configuration template",
        configurationJson: defaultConfig,
        isConfigValid: true,
      });
      setOriginalFormData({
        name: "Default Configuration",
        description: "Default deployment configuration template",
        configurationJson: defaultConfig,
        isConfigValid: true,
      });

      toast.success(`Version ${selectedVersion.version} deleted successfully`);
    } catch (error) {
      toast.error("Failed to delete version");
      console.error("Error deleting deployment:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Connectivity check mutation - shared between step components and deploy button
  const connectivityCheckMutation = useMutation({
    ...trpc.checkDeviceConnectivity.mutationOptions(),
    onSuccess: (data) => {
      setConnectivityResult(data);
      if (data.success) {
        toast.success(t("deployments.steps.connectivitySuccess"));
      } else {
        toast.error(t("deployments.steps.connectivityFailed"));
      }
    },
    onError: (error) => {
      setConnectivityResult(null);
      toast.error(error.message || t("deployments.steps.connectivityError"));
    },
  });

  // State for connectivity check results (shared with step components)
  const [connectivityResult, setConnectivityResult] = useState<{
    success: boolean;
    executionId?: string;
    ping: { success: boolean; error?: string; rawOutput: string; latency?: number };
    ansible: { success: boolean; error?: string; rawOutput: string };
  } | null>(null);

  // State for connectivity check dialog
  const [isConnectivityDialogOpen, setIsConnectivityDialogOpen] = useState(false);

  // Handler for connectivity check - used by both step components and deploy button
  const handleCheckConnectivity = () => {
    if (selectedDeviceId) {
      setConnectivityResult(null);
      setIsConnectivityDialogOpen(true);
      connectivityCheckMutation.mutate({ deviceId: selectedDeviceId });
    }
  };

  const handleDeploy = async () => {
    if (!selectedDeviceId) {
      toast.error("Please select a device first");
      return;
    }

    // Determine if this is a connectivity check (steps 1 & 3) or deploy/install (steps 2 & 4)
    const isConnectivityCheck = activeDeploymentStep === "booting-live" || activeDeploymentStep === "rebooting";

    // For connectivity check, use the same code as the step components
    if (isConnectivityCheck) {
      handleCheckConnectivity();
      return;
    }

    // For install/provisioning steps, require valid config and saved version
    if (!formData.isConfigValid) {
      toast.error("Please fix configuration errors before deploying");
      return;
    }

    if (!selectedVersion || selectedVersion.id === "default") {
      toast.error("Please select a saved version to deploy");
      return;
    }

    setIsLoading(true);
    try {
      // Determine flow type based on current step
      const flowType: "install" | "provisioning" = activeDeploymentStep === "provisioning" ? "provisioning" : "install";

      {
        // Parse the JSON configuration for install/provisioning
        const configObject = JSON.parse(formData.configurationJson);

        // Ensure name and version exist in the configuration object
        if (!configObject.name) {
          configObject.name =
            formData.name.trim() || generateRandomDeploymentName();
        }
        if (!configObject.version) {
          configObject.version = selectedVersion?.version || "1.0.0";
        }

        // Ensure target_ip is set from the selected device
        const selectedDevice = devicesQuery.data?.find(
          (d) => d.id === selectedDeviceId
        );
        if (selectedDevice?.ip_address) {
          configObject.target_ip = selectedDevice.ip_address;
        }

        // Validate the configuration with Zod schema
        deploymentConfigSchema.parse(configObject);

        // Always save the configuration before deploying to ensure target_ip is persisted
        const deploymentName =
          formData.name.trim() || generateRandomDeploymentName();

        await updateDeploymentMutation.mutateAsync({
          id: selectedVersion!.id,
          name: deploymentName,
          device_id: selectedDeviceId,
          configuration: configObject,
        });

        // Update original form data to reflect saved state with the actual name used
        const updatedConfigJson = JSON.stringify(configObject, null, 2);
        setOriginalFormData({
          name: deploymentName,
          description: formData.description,
          configurationJson: updatedConfigJson,
          isConfigValid: formData.isConfigValid,
        });
        setFormData((prev) => ({
          ...prev,
          configurationJson: updatedConfigJson,
        }));

        // Execute Kestra deployment
        const result = await executeKestraDeploymentMutation.mutateAsync({
          device_id: selectedDeviceId,
          deployment_id: selectedVersion!.id,
          configuration: configObject,
          flow_type: flowType,
        });

        // Show deployment status dialog
        setDeploymentStatus({
          open: true,
          executionId: result.executionId,
          flowId: result.flowId,
          status: result.status as "RUNNING" | "SUCCESS" | "FAILED" | "PENDING",
          startedAt: result.startedAt,
          message: result.message,
        });

        // Start polling for status updates
        startStatusPolling(result.executionId, result.flowId);

        const successMessage = activeDeploymentStep === "provisioning"
          ? "Provisioning started successfully"
          : "Installation started successfully";
        toast.success(successMessage);
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON in configuration");
      } else {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to start operation";
        toast.error(errorMessage);
        setDeploymentStatus({
          open: true,
          status: "FAILED",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          message: errorMessage,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle save from unsaved changes dialog
  const handleDialogSave = async () => {
    try {
      await handleSave();
      executePendingAction();
    } catch (error) {
      // Error already handled in handleSave
    }
  };

  // Handle discard from unsaved changes dialog
  const handleDialogDiscard = async () => {
    if (originalFormData) {
      setFormData(originalFormData);
    }
    await executePendingAction();
  };

  // Handle cancel from unsaved changes dialog
  const handleDialogCancel = () => {
    setPendingAction(null);
    setPendingDeviceId(undefined);
    setShowUnsavedChangesDialog(false);
  };

  // Execute pending action after save or discard
  const executePendingAction = async () => {
    if (pendingAction) {
      await pendingAction();
      setPendingAction(null);
    }
    if (pendingDeviceId !== undefined) {
      handleDeviceChange(pendingDeviceId);
      setPendingDeviceId(undefined);
    }
    setShowUnsavedChangesDialog(false);
  };

  // Handle device selection - auto-select latest version and expand versions pane
  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);

    // Auto-select domain and network based on device
    const device = devicesQuery.data?.find((d) => d.id === deviceId);
    if (device) {
      if (device.network_id) {
        setSelectedNetworkId(device.network_id);
        // Find domain from network
        const network = networksQuery.data?.find(
          (n) => n.id === device.network_id
        );
        if (network?.domain_id) {
          setSelectedDomainId(network.domain_id);
        }
      }
    }

    // Move to step 1 (booting-live) and expand versions pane
    setActiveDeploymentStep("booting-live");
    setIsVersionsPanelCollapsed(false);

    // Fetch versions for the device and auto-select latest or create first version
    try {
      const versions = await queryClient.fetchQuery(
        trpc.getDeploymentVersions.queryOptions({ device_id: deviceId })
      );

      if (versions && versions.length > 0) {
        // Sort by version number descending to get the latest
        const sortedVersions = [...versions].sort(
          (a, b) => b.version - a.version
        );
        const latestVersion = sortedVersions[0];

        // Load the latest version (this will update form data)
        await handleVersionSelect(latestVersion);
      } else {
        // No versions exist, create the first one with default config
        setIsLoading(true);
        try {
          const configObject = { ...defaultDeploymentConfig };
          const versionName = generateRandomDeploymentName();

          // Ensure name and version exist in the configuration object
          configObject.name = versionName;
          configObject.version = "1";

          // Validate the configuration with Zod schema
          deploymentConfigSchema.parse(configObject);

          // Create the new deployment in the backend
          const result = await createDeploymentMutation.mutateAsync({
            device_id: deviceId,
            name: versionName,
            configuration: configObject,
            version: "1",
          });

          // Invalidate the versions query to refresh the list
          await queryClient.invalidateQueries({
            queryKey: trpc.getDeploymentVersions.queryKey({
              device_id: deviceId,
            }),
          });

          // Update local state with the new version
          const newVersionData: DeploymentVersion = {
            id: result.id,
            name: result.name || versionName,
            version: "1",
            modified_at: result.modified_at || new Date().toISOString(),
            device_id: deviceId,
            description: null,
          };

          setSelectedVersion(newVersionData);
          const configJson = JSON.stringify(configObject, null, 2);
          setFormData({
            name: versionName,
            description: "",
            configurationJson: configJson,
            isConfigValid: true,
          });
          setOriginalFormData({
            name: versionName,
            description: "",
            configurationJson: configJson,
            isConfigValid: true,
          });

          toast.success(t("deployments.createdFirstVersion") || "Created first version automatically");
        } catch (error) {
          toast.error(t("deployments.failedToCreateVersion") || "Failed to create version");
          console.error("Error creating first version:", error);
          // Reset to default form data on error
          setSelectedVersion(undefined);
          setFormData(initialFormData);
          setOriginalFormData(initialFormData);
        } finally {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error("Error fetching versions:", error);
      toast.error(t("deployments.failedToLoadVersions") || "Failed to load versions");
      // Reset to default form data on error
      setSelectedVersion(undefined);
      setFormData(initialFormData);
      setOriginalFormData(initialFormData);
    }
  };

  const [isVersionsPanelCollapsed, setIsVersionsPanelCollapsed] = useState(
    persistedSettings.isVersionsPanelCollapsed ?? true
  );
  const [accordionValue, setAccordionValue] = useState<string[]>(
    persistedSettings.accordionValue ?? ["basic-info", "configuration"]
  );
  const [activeDeploymentStep, setActiveDeploymentStep] =
    useState<DeploymentStep>(
      persistedSettings.activeDeploymentStep ?? "booting-live"
    );
  const [isOsInstallationJsonMode, setIsOsInstallationJsonMode] =
    useState(false);

  // Clear connectivity result when step changes (Step 1 and Step 3 are independent checks)
  useEffect(() => {
    setConnectivityResult(null);
  }, [activeDeploymentStep]);

  // Persist settings to localStorage whenever relevant state changes
  useEffect(() => {
    // Skip the initial mount to avoid overwriting with potentially stale data
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    persistSettings({
      selectedDeviceId,
      selectedDomainId,
      selectedNetworkId,
      selectedVersion,
      formName: formData.name,
      formDescription: formData.description,
      configurationJson: formData.configurationJson,
      activeDeploymentStep,
      isVersionsPanelCollapsed,
      accordionValue,
    });
  }, [
    selectedDeviceId,
    selectedDomainId,
    selectedNetworkId,
    selectedVersion,
    formData.name,
    formData.description,
    formData.configurationJson,
    activeDeploymentStep,
    isVersionsPanelCollapsed,
    accordionValue,
    persistSettings,
  ]);

  // Handle OS Installation mode change (FORM/JSON toggle)
  const handleOsInstallationModeChange = (isJsonMode: boolean) => {
    setIsOsInstallationJsonMode(isJsonMode);
    // Auto-expand versions pane when JSON mode is active
    if (isJsonMode) {
      setIsVersionsPanelCollapsed(false);
    }
  };

  // Auto-select latest version or create first version if needed
  const ensureVersionSelected = async () => {
    if (!selectedDeviceId) {
      toast.error(t("deployments.selectDeviceFirst") || "Please select a device first");
      return false;
    }

    // If we already have a valid version selected (not default), we're good
    if (selectedVersion && selectedVersion.id !== "default") {
      return true;
    }

    // Fetch versions for the device
    try {
      const versions = await queryClient.fetchQuery(
        trpc.getDeploymentVersions.queryOptions({ device_id: selectedDeviceId })
      );

      if (versions && versions.length > 0) {
        // Sort by version number descending to get the latest
        const sortedVersions = [...versions].sort(
          (a, b) => b.version - a.version
        );
        const latestVersion = sortedVersions[0];

        // Load the latest version
        await handleVersionSelect(latestVersion);
        toast.info(t("deployments.autoSelectedLatestVersion") || `Auto-selected version ${latestVersion.version}`);
        return true;
      } else {
        // No versions exist, create the first one
        setIsLoading(true);
        try {
          const configObject = JSON.parse(formData.configurationJson);
          const versionName = formData.name.trim() || generateRandomDeploymentName();

          // Ensure name and version exist in the configuration object
          if (!configObject.name) {
            configObject.name = versionName;
          }
          if (!configObject.version) {
            configObject.version = "1";
          }

          // Validate the configuration with Zod schema
          deploymentConfigSchema.parse(configObject);

          // Create the new deployment in the backend
          const result = await createDeploymentMutation.mutateAsync({
            device_id: selectedDeviceId,
            name: versionName,
            configuration: configObject,
            version: "1",
          });

          // Invalidate the versions query to refresh the list
          await queryClient.invalidateQueries({
            queryKey: trpc.getDeploymentVersions.queryKey({
              device_id: selectedDeviceId,
            }),
          });

          // Update local state with the new version
          const newVersionData: DeploymentVersion = {
            id: result.id,
            name: result.name || versionName,
            version: "1",
            modified_at: result.modified_at || new Date().toISOString(),
            device_id: selectedDeviceId,
            description: null,
          };

          setSelectedVersion(newVersionData);
          const updatedConfigJson = JSON.stringify(configObject, null, 2);
          setFormData((prev) => ({
            ...prev,
            name: versionName,
            configurationJson: updatedConfigJson,
          }));
          setOriginalFormData({
            name: versionName,
            description: formData.description,
            configurationJson: updatedConfigJson,
            isConfigValid: true,
          });

          toast.success(t("deployments.createdFirstVersion") || "Created first version automatically");
          return true;
        } catch (error) {
          toast.error(t("deployments.failedToCreateVersion") || "Failed to create version");
          console.error("Error creating first version:", error);
          return false;
        } finally {
          setIsLoading(false);
        }
      }
    } catch (error) {
      console.error("Error fetching versions:", error);
      toast.error(t("deployments.failedToLoadVersions") || "Failed to load versions");
      return false;
    }
  };

  // Handle deployment step change - expand versions pane on all steps
  const handleDeploymentStepChange = async (step: DeploymentStep) => {
    // For steps 2 (os-installation) and 4 (provisioning), ensure a version is selected
    const isDeployableStep = step === "os-installation" || step === "provisioning";

    if (isDeployableStep) {
      const hasVersion = await ensureVersionSelected();
      if (!hasVersion) {
        // Stay on current step if we couldn't ensure a version
        return;
      }
    }

    setActiveDeploymentStep(step);
    // Expand versions pane on all steps
    setIsVersionsPanelCollapsed(false);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Main Layout Flex */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left Panel - Form */}
          <div className="min-w-0 flex-1">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Accordion
                type="multiple"
                value={accordionValue}
                onValueChange={setAccordionValue}
                className="space-y-6"
              >
                {/* Basic Information */}
                <AccordionItem value="basic-info" className="border-none">
                  <Card>
                    <CardHeader>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex w-full items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="flex items-center gap-2">
                              <FontAwesomeIcon
                                icon={faGear}
                                className="h-5 w-5"
                              />
                              {t("deployments.basicInformation")}
                            </CardTitle>
                            {/* Show description only when expanded */}
                            {accordionValue.includes("basic-info") && (
                              <CardDescription className="text-left">
                                {t("deployments.basicInformationDescription")}
                              </CardDescription>
                            )}
                            {/* Show selected device when collapsed - centered */}
                            {!accordionValue.includes("basic-info") &&
                              selectedDeviceId && (
                                <div className="mt-2 flex items-center justify-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {(() => {
                                      const device = devicesQuery.data?.find(
                                        (d) => d.id === selectedDeviceId,
                                      );
                                      if (!device)
                                        return selectedDeviceId.slice(0, 8);
                                      return device.name && device.ip_address
                                        ? `${device.name} (${device.ip_address})`
                                        : device.name
                                          ? device.name
                                          : device.ip_address ||
                                            `Device ${device.id.slice(0, 8)}`;
                                    })()}
                                  </Badge>
                                </div>
                              )}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormData(initialFormData);
                              setSelectedDomainId(undefined);
                              setSelectedNetworkId(undefined);
                              setSelectedDeviceId(undefined);
                              toast.success(
                                t("buttons.reset") + " - Basic Information",
                              );
                            }}
                            className="shrink-0"
                          >
                            <FontAwesomeIcon
                              icon={faRotateLeft}
                              className="mr-2 h-4 w-4"
                              aria-hidden="true"
                            />
                            {t("buttons.reset")}
                          </Button>
                        </div>
                      </AccordionTrigger>
                    </CardHeader>
                    <AccordionContent>
                      <CardContent className="space-y-4">
                        {/* Filter and Device Selection */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          {/* Domain Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="domain-selection">
                              {t("domains.domain")}
                            </Label>
                            <Select
                              value={selectedDomainId || "all"}
                              onValueChange={(value) => {
                                setSelectedDomainId(
                                  value === "all" ? undefined : value,
                                );
                                // Reset network if it doesn't belong to the new domain
                                if (value !== "all" && networksQuery.data) {
                                  const validNetwork = networksQuery.data.find(
                                    (n) =>
                                      n.id === selectedNetworkId &&
                                      n.domain_id === value,
                                  );
                                  if (!validNetwork) {
                                    setSelectedNetworkId(undefined);
                                  }
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t("domains.selectDomain")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Domains</SelectItem>
                                {domainsQuery.data?.map((domain) => (
                                  <SelectItem key={domain.id} value={domain.id}>
                                    {domain.display_name || domain.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Network Filter */}
                          <div className="space-y-2">
                            <Label htmlFor="network-selection">
                              {t("networks.network")}
                            </Label>
                            <Select
                              value={selectedNetworkId || "all"}
                              onValueChange={(value) => {
                                const networkId =
                                  value === "all" ? undefined : value;
                                setSelectedNetworkId(networkId);

                                // Auto-select domain if not already selected
                                if (networkId && !selectedDomainId) {
                                  const network = networksQuery.data?.find(
                                    (n) => n.id === networkId,
                                  );
                                  if (network?.domain_id) {
                                    setSelectedDomainId(network.domain_id);
                                  }
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t("networks.selectNetwork")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">
                                  All Networks
                                </SelectItem>
                                {networksQuery.data?.map((network) => (
                                  <SelectItem
                                    key={network.id}
                                    value={network.id}
                                  >
                                    {network.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Device Selection */}
                          <div className="space-y-2">
                            <Label htmlFor="device-selection">
                              {t("devices.device")}
                            </Label>
                            <Select
                              value={selectedDeviceId || ""}
                              onValueChange={(value) => {
                                if (!value) return;
                                if (hasUnsavedChanges) {
                                  setPendingDeviceId(value);
                                  setDialogMode("device-change");
                                  setShowUnsavedChangesDialog(true);
                                } else {
                                  handleDeviceChange(value);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t("devices.selectDevice")}
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {devicesQuery.data?.map((device) => {
                                  return (
                                    <SelectItem
                                      key={device.id}
                                      value={device.id}
                                    >
                                      {device.name && device.ip_address
                                        ? `${device.name} (${device.ip_address})`
                                        : device.name
                                          ? device.name
                                          : device.ip_address ||
                                            `Device ${device.id.slice(0, 8)}`}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="deployment-name">
                            {t("deployments.name")}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="deployment-name"
                              type="text"
                              value={formData.name}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  name: e.target.value,
                                })
                              }
                              placeholder={
                                t("deployments.namePlaceholder") ||
                                "Leave empty for a fun auto-generated name"
                              }
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                const randomName =
                                  generateRandomDeploymentName();
                                setFormData({ ...formData, name: randomName });
                                toast.success(`Generated name: ${randomName}`);
                              }}
                              title="Generate random name"
                            >
                              <FontAwesomeIcon
                                icon={faDice}
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="deployment-description">
                            {t("deployments.description")}
                          </Label>
                          <Textarea
                            id="deployment-description"
                            value={formData.description}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                description: e.target.value,
                              })
                            }
                            placeholder={t(
                              "deployments.descriptionPlaceholder",
                            )}
                            rows={3}
                          />
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Deployment Configuration */}
                <AccordionItem value="configuration" className="border-none">
                  <Card>
                    <CardHeader>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="w-full">
                          <CardTitle className="flex items-center gap-2">
                            <FontAwesomeIcon
                              icon={faFileLines}
                              className="h-5 w-5"
                            />
                            {t("deployments.configuration")}
                          </CardTitle>
                          <CardDescription>
                            {t("deployments.configurationDescription")}
                          </CardDescription>
                        </div>
                      </AccordionTrigger>
                    </CardHeader>
                    <AccordionContent>
                      <CardContent className="space-y-4">
                        <DeploymentStepTabs
                          activeStep={activeDeploymentStep}
                          onStepChange={handleDeploymentStepChange}
                        >
                          <DeploymentStepContent step="booting-live">
                            <BootingLiveStep
                              deviceId={selectedDeviceId}
                              deviceName={
                                devicesQuery.data?.find(
                                  (d) => d.id === selectedDeviceId
                                )?.name
                              }
                              networkId={selectedNetworkId}
                              domainId={selectedDomainId}
                              totpCounter={
                                devicesQuery.data?.find(
                                  (d) => d.id === selectedDeviceId
                                )?.totp_counter ?? 0
                              }
                              onCheckConnectivity={handleCheckConnectivity}
                              isCheckingConnectivity={connectivityCheckMutation.isPending}
                              connectivityResult={connectivityResult}
                            />
                          </DeploymentStepContent>

                          <DeploymentStepContent step="os-installation">
                            <OsInstallationStep
                              configurationJson={formData.configurationJson}
                              onConfigurationChange={handleJsonChange}
                              onModeChange={handleOsInstallationModeChange}
                            />
                          </DeploymentStepContent>

                          <DeploymentStepContent step="rebooting">
                            <RebootingStep
                              deviceId={selectedDeviceId}
                              onCheckConnectivity={handleCheckConnectivity}
                              isCheckingConnectivity={connectivityCheckMutation.isPending}
                              connectivityResult={connectivityResult}
                            />
                          </DeploymentStepContent>

                          <DeploymentStepContent step="provisioning">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label>JSON Configuration</Label>
                                <div className="flex items-center gap-2">
                                  <Label
                                    htmlFor="load-file"
                                    className="cursor-pointer"
                                  >
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="flex items-center gap-2"
                                      asChild
                                    >
                                      <span>
                                        <FontAwesomeIcon
                                          icon={faUpload}
                                          className="h-4 w-4"
                                          aria-hidden="true"
                                        />
                                        Load from file
                                      </span>
                                    </Button>
                                  </Label>
                                  <Input
                                    id="load-file"
                                    type="file"
                                    onChange={loadFromFile}
                                    accept=".json"
                                    className="sr-only"
                                  />
                                </div>
                              </div>
                              <div className="overflow-hidden rounded-md border">
                                <Editor
                                  height="500px"
                                  language="json"
                                  theme={isDarkMode ? "vs-dark" : "light"}
                                  value={formData.configurationJson}
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
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                Edit your deployment configuration directly or
                                load from a JSON file. The editor provides
                                syntax highlighting, validation, and
                                auto-formatting.
                              </p>
                            </div>
                          </DeploymentStepContent>
                        </DeploymentStepTabs>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              </Accordion>

              {/* Form Actions - Moved to fixed bottom panel */}
            </form>
          </div>

          {/* Right Panel - Version List */}
          <div
            className={cn(
              "shrink-0 transition-all duration-300",
              isVersionsPanelCollapsed ? "w-12" : "w-full lg:w-80",
            )}
          >
            <VersionListPanel
              deviceId={selectedDeviceId}
              activeVersionId={selectedVersion?.id}
              onVersionSelect={handleVersionSelect}
              className="sticky top-4 max-h-[calc(100vh-8rem)]"
              isCollapsed={isVersionsPanelCollapsed}
              onToggle={() =>
                setIsVersionsPanelCollapsed(!isVersionsPanelCollapsed)
              }
            />
          </div>
        </div>

        {/* Deployment Jobs Section - Full Width */}
        {selectedDeviceId && (
          <div className="mt-6 pb-24">
            <DeploymentJobsList
              deviceId={selectedDeviceId}
              maxItems={5}
              onViewLogs={(executionId) => {
                const debugUrl = `/deployments/debug/${executionId}`;
                window.open(debugUrl, "_blank");
              }}
            />
          </div>
        )}
      </div>

      {/* Fixed Bottom Actions Panel */}
      <DeploymentActionsPanel
        selectedDeviceId={selectedDeviceId}
        hasUnsavedChanges={hasUnsavedChanges}
        isLoading={isLoading || connectivityCheckMutation.isPending}
        currentVersion={selectedVersion}
        currentStep={activeDeploymentStep}
        onReset={handleReset}
        onNewVersion={handleNewVersion}
        onSave={handleSave}
        onDeploy={handleDeploy}
        onDelete={handleDelete}
        connectivityResult={connectivityResult}
      />

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedChangesDialog}
        onOpenChange={setShowUnsavedChangesDialog}
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
        isSaving={isLoading}
        title={
          dialogMode === "device-change"
            ? "Change Device?"
            : dialogMode === "version-change"
              ? "Switch Version?"
              : "Leave Page?"
        }
        description={
          dialogMode === "device-change"
            ? "You have unsaved changes. Changing the device will lose your current work."
            : dialogMode === "version-change"
              ? "You have unsaved changes. Switching versions will lose your current work."
              : "You have unsaved changes that will be lost if you leave this page."
        }
      />

      {/* Deployment Status Dialog */}
      <DeploymentStatusDialog
        open={deploymentStatus.open}
        onOpenChange={(open) => {
          setDeploymentStatus((prev) => ({ ...prev, open }));
          // Stop polling and refresh jobs table if dialog is closed
          if (!open) {
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }
            // Refresh deployment jobs table
            queryClient.invalidateQueries({
              queryKey: trpc.listDeploymentJobs.queryKey({
                device_id: selectedDeviceId,
              }),
            });
          }
        }}
        executionId={deploymentStatus.executionId}
        flowId={deploymentStatus.flowId}
        status={deploymentStatus.status}
        startedAt={deploymentStatus.startedAt}
        completedAt={deploymentStatus.completedAt}
        message={deploymentStatus.message}
        onViewDebug={() => {
          if (deploymentStatus.executionId) {
            // Open debug view in new tab
            const debugUrl = `/deployments/debug/${deploymentStatus.executionId}`;
            window.open(debugUrl, "_blank");
          }
        }}
      />

      {/* Connectivity Check Dialog */}
      <ConnectivityCheckDialog
        open={isConnectivityDialogOpen}
        onOpenChange={setIsConnectivityDialogOpen}
        isChecking={connectivityCheckMutation.isPending}
        result={connectivityResult}
        deviceName={selectedDevice?.name}
        deviceIp={selectedDevice?.ip_address ?? undefined}
        sshKeyId={selectedDevice?.ssh_key_id ?? null}
      />
    </div>
  );
}
