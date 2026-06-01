import { useCallback, useEffect, useState } from "react";
import type { DeploymentStep } from "@/components/deployment-step-tabs";

const STORAGE_KEY = "iotgw-deployment-settings";

export interface DeploymentVersion {
  id: string;
  name: string;
  description: string | null;
  version: string;
  modified_at: string;
  device_id: string | null;
}

export interface DeploymentSettings {
  // Selection state
  selectedDeviceId?: string;
  selectedDomainId?: string;
  selectedNetworkId?: string;
  selectedVersion?: DeploymentVersion;
  // Form data
  formName: string;
  formDescription: string;
  configurationJson: string;
  // UI state
  activeDeploymentStep: DeploymentStep;
  isVersionsPanelCollapsed: boolean;
  accordionValue: string[];
}

const defaultSettings: DeploymentSettings = {
  selectedDeviceId: undefined,
  selectedDomainId: undefined,
  selectedNetworkId: undefined,
  selectedVersion: undefined,
  formName: "",
  formDescription: "",
  configurationJson: "",
  activeDeploymentStep: "booting-live",
  isVersionsPanelCollapsed: true,
  accordionValue: ["basic-info", "configuration"], // Both panes expanded by default
};

/**
 * Hook to persist deployment page settings to localStorage
 */
export function useDeploymentSettings() {
  const [settings, setSettingsState] = useState<DeploymentSettings>(() => {
    if (typeof window === "undefined") {
      return defaultSettings;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DeploymentSettings>;
        return { ...defaultSettings, ...parsed };
      }
    } catch (error) {
      console.warn("Error reading deployment settings from localStorage:", error);
    }
    return defaultSettings;
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("Error saving deployment settings to localStorage:", error);
    }
  }, [settings]);

  // Update a single setting
  const updateSetting = useCallback(
    <K extends keyof DeploymentSettings>(key: K, value: DeploymentSettings[K]) => {
      setSettingsState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Update multiple settings at once
  const updateSettings = useCallback(
    (updates: Partial<DeploymentSettings>) => {
      setSettingsState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  // Clear all settings
  const clearSettings = useCallback(() => {
    setSettingsState(defaultSettings);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("Error clearing deployment settings from localStorage:", error);
    }
  }, []);

  return {
    settings,
    updateSetting,
    updateSettings,
    clearSettings,
  };
}
