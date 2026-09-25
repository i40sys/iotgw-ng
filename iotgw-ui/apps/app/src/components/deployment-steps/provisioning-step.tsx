import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfigStepEditor } from "./config-step-editor";

interface ProvisioningStepProps {
  configurationJson: string;
  onConfigurationChange: (json: string) => void;
  onModeChange?: (isJsonMode: boolean) => void;
  onLoadFromFile?: (event: ChangeEvent<HTMLInputElement>) => void;
}

// Step 4 — every provisioning variable of the Kestra `provisioning` playbook,
// rendered from the deployment-config JSON Schema (x-step "provisioning").
export function ProvisioningStep({
  configurationJson,
  onConfigurationChange,
  onModeChange,
  onLoadFromFile,
}: ProvisioningStepProps) {
  const { t } = useTranslation();

  const loadButton = onLoadFromFile && (
    <>
      <Label htmlFor="provisioning-load-file" className="cursor-pointer">
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
            {t("deployments.steps.config.loadFromFile")}
          </span>
        </Button>
      </Label>
      <Input
        id="provisioning-load-file"
        type="file"
        accept=".json"
        onChange={onLoadFromFile}
        className="sr-only"
      />
    </>
  );

  return (
    <ConfigStepEditor
      step="provisioning"
      configurationJson={configurationJson}
      onConfigurationChange={onConfigurationChange}
      onModeChange={onModeChange}
      toolbar={loadButton}
      description={t("deployments.steps.config.provisioningDescription")}
    />
  );
}
