import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ErrorDisplay } from "@/components/ui/error-display";
import { Badge } from "@/components/ui/badge";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileLines,
  faClock,
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";
import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";

interface DeploymentVersion {
  id: string;
  name: string;
  description: string | null;
  version: string;
  modified_at: string;
  device_id: string | null;
}

interface VersionListPanelProps {
  deviceId?: string;
  activeVersionId?: string;
  onVersionSelect: (version: DeploymentVersion) => void;
  className?: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

export function VersionListPanel({
  deviceId,
  activeVersionId,
  onVersionSelect,
  className,
  isCollapsed,
  onToggle,
}: VersionListPanelProps) {
  const { t } = useTranslation();

  const versionsQuery = useQuery({
    ...trpc.getDeploymentVersions.queryOptions({ device_id: deviceId ?? "" }),
    enabled: !!deviceId,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getVersionDisplayName = (version: DeploymentVersion) => {
    return version.name || `Version ${version.version}`;
  };

  const getVersionDescription = (version: DeploymentVersion) => {
    return version.description || "No description available";
  };

  // Show default version when no versions exist AND device is selected
  const showDefaultVersion =
    deviceId &&
    !versionsQuery.isLoading &&
    (!versionsQuery.data || versionsQuery.data.length === 0);

  // Sort versions by version number in descending order (newest first)
  const sortedVersions = versionsQuery.data
    ? [...versionsQuery.data].sort((a, b) => {
        const versionA = parseInt(a.version, 10);
        const versionB = parseInt(b.version, 10);
        return versionB - versionA; // Descending order
      })
    : [];

  if (versionsQuery.isError) {
    return (
      <Card className={cn("flex h-full flex-col", className)}>
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFileLines} className="h-5 w-5" />
            {t("deployments.versions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <ErrorDisplay error={versionsQuery.error as Error} />
        </CardContent>
      </Card>
    );
  }

  if (isCollapsed) {
    return (
      <Card
        className={cn(
          "hover:bg-muted/50 flex h-full cursor-pointer flex-col items-center py-4 transition-all duration-300",
          className,
        )}
        onClick={onToggle}
      >
        <Button variant="ghost" size="sm" className="mb-4 h-8 w-8 p-0">
          <FontAwesomeIcon icon={faChevronDown} className="h-4 w-4 rotate-90" />
        </Button>
        <div
          className="writing-mode-vertical text-muted-foreground flex items-center gap-2 font-medium"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          <FontAwesomeIcon icon={faFileLines} className="h-4 w-4 rotate-90" />
          <span className="rotate-180">{t("deployments.versions")}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "flex h-full flex-col transition-all duration-300",
        className,
      )}
    >
      <CardHeader className="flex-shrink-0 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFileLines} className="h-5 w-5" />
            {t("deployments.versions")}
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <FontAwesomeIcon icon={faChevronUp} className="h-4 w-4 rotate-90" />
          </Button>
        </div>
        <CardDescription>
          {deviceId
            ? t("deployments.versionsForDevice")
            : t("deployments.selectDeviceToViewVersions")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="h-full overflow-y-auto">
          <div className="space-y-2 p-4">
            {!deviceId ? (
              <div className="text-muted-foreground py-8 text-center">
                {t("deployments.selectDeviceToViewVersions")}
              </div>
            ) : versionsQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : showDefaultVersion ? (
              <Button
                variant="ghost"
                className={cn(
                  "h-auto w-full justify-start p-4 text-left",
                  "hover:bg-muted/50",
                  !deviceId && "cursor-not-allowed opacity-50",
                )}
                disabled={!deviceId}
                onClick={() => {
                  if (deviceId) {
                    onVersionSelect({
                      id: "default",
                      name: "Version 1",
                      description: "Default configuration",
                      version: "1",
                      modified_at: new Date().toISOString(),
                      device_id: deviceId,
                    });
                  }
                }}
              >
                <div className="w-full space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Version 1</span>
                    <Badge variant="secondary" className="text-xs">
                      {t("deployments.default")}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Default configuration
                  </p>
                  <div className="text-muted-foreground flex items-center gap-1 text-xs">
                    <FontAwesomeIcon
                      icon={faClock}
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                    <span>{formatDate(new Date().toISOString())}</span>
                  </div>
                </div>
              </Button>
            ) : (
              sortedVersions.map((version) => {
                const isActive = activeVersionId === version.id;
                return (
                  <Button
                    key={version.id}
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "h-auto w-full justify-start p-4 text-left",
                      isActive
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "hover:bg-muted/50",
                    )}
                    onClick={() => onVersionSelect(version)}
                  >
                    <div className="w-full space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {getVersionDisplayName(version)}
                        </span>
                        <Badge
                          variant={isActive ? "secondary" : "outline"}
                          className="text-xs"
                        >
                          v{version.version}
                        </Badge>
                      </div>
                      <p
                        className={cn(
                          "truncate text-sm",
                          isActive
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {getVersionDescription(version)}
                      </p>
                      <div
                        className={cn(
                          "flex items-center gap-1 text-xs",
                          isActive
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        <FontAwesomeIcon
                          icon={faClock}
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        <span>{formatDate(version.modified_at)}</span>
                      </div>
                    </div>
                  </Button>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
