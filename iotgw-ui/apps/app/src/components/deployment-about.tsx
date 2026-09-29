import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, Info, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { frontendBuild } from "@/utils/version";
import { trpc } from "@/utils/trpc";
import { deploymentDiagnostics } from "@/lib/deployment-info";
import type { ComponentStatus } from "@/lib/deployment-info";

export function DeploymentAbout() {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [showCopyFallback, setShowCopyFallback] = useState(false);
  const copyRef = useRef<HTMLTextAreaElement>(null);
  const query = useQuery({
    ...trpc.getDeploymentInfo.queryOptions(),
    enabled: isOpen || !frontendBuild.development,
    staleTime: 30_000,
    refetchInterval: isOpen ? 30_000 : false,
    retry: 1,
  });
  const info = query.data;
  const manifest = info?.manifest;
  const diagnostics = deploymentDiagnostics(frontendBuild, info);
  const hasMismatch = diagnostics.components.some(
    (component) => component.status === "mismatch",
  );
  const shortRevision = frontendBuild.revision?.slice(0, 7);
  const label = frontendBuild.development
    ? `DEV${shortRevision ? ` · ${shortRevision}` : ""}${frontendBuild.dirty ? "*" : ""}`
    : (manifest?.release ??
      (shortRevision
        ? `BUILD · ${shortRevision}`
        : t("deploymentAbout.unknownVersion")));
  const unknown = t("deploymentAbout.unknown");
  const date = (value: string) =>
    new Date(value).toLocaleString(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const statusLabel = (status: ComponentStatus) =>
    t(`deploymentAbout.status.${status}`);
  const diagnosticText = JSON.stringify(
    { ...diagnostics, metadataReachable: query.isSuccess },
    null,
    2,
  );

  useEffect(() => {
    if (showCopyFallback) {
      copyRef.current?.focus();
      copyRef.current?.select();
    }
  }, [showCopyFallback]);

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(diagnosticText);
      toast.success(t("deploymentAbout.copied"));
    } catch {
      setShowCopyFallback(true);
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setShowCopyFallback(false);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring inline-flex max-w-44 cursor-pointer items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:text-xs"
          aria-label={t("deploymentAbout.open", { version: label })}
          title={t("deploymentAbout.open", { version: label })}
        >
          <span className="truncate">{label}</span>
          {hasMismatch && (
            <TriangleAlert
              className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
              aria-label={t("deploymentAbout.mismatch")}
            />
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-xl">
        <DialogHeader className="pr-5 text-left">
          <DialogTitle>{t("deploymentAbout.title")}</DialogTitle>
          <DialogDescription>
            {t("deploymentAbout.description")}
          </DialogDescription>
        </DialogHeader>
        <dl className="bg-muted/40 grid grid-cols-1 gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">
              {t("deploymentAbout.release")}
            </dt>
            <dd className="mt-1 font-medium">
              {manifest?.release ?? t("deploymentAbout.notDeclared")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">
              {t("deploymentAbout.environment")}
            </dt>
            <dd className="mt-1 font-medium">
              {diagnostics.environment
                ? t(`deploymentAbout.environments.${diagnostics.environment}`)
                : unknown}
            </dd>
          </div>
          {manifest && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">
                {t("deploymentAbout.createdAt")}
              </dt>
              <dd className="mt-1">{date(manifest.createdAt)}</dd>
            </div>
          )}
        </dl>
        {frontendBuild.development && (
          <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
            <Info className="mt-0.5 size-4 shrink-0" />
            {t("deploymentAbout.developmentNotice")}
          </p>
        )}
        {query.isPending && query.isFetching && (
          <p
            role="status"
            className="text-muted-foreground flex items-center gap-2 text-sm"
          >
            <Loader2 className="size-4 animate-spin" />
            {t("deploymentAbout.loading")}
          </p>
        )}
        {query.isError && (
          <div role="alert" className="space-y-2 text-sm">
            <p>{t("deploymentAbout.unavailable")}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t("deploymentAbout.retry")}
            </Button>
          </div>
        )}
        {info && info.metadataStatus !== "available" && (
          <p role="status" className="text-muted-foreground text-sm">
            {t(`deploymentAbout.${info.metadataStatus}Manifest`)}
          </p>
        )}
        {hasMismatch && (
          <p
            role="status"
            className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t("deploymentAbout.mismatch")}
          </p>
        )}
        <div className="space-y-3">
          {[frontendBuild, ...(info ? [info.backend] : [])].map((build) => {
            const status =
              diagnostics.components.find(
                (component) => component.id === build.component,
              )?.status ?? "unverified";
            const expected = manifest?.components.find(
              (component) => component.id === build.component,
            );
            return (
              <section
                key={build.component}
                className="min-w-0 space-y-2 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    {t(`deploymentAbout.${build.component}`)}
                  </h3>
                  <Badge variant="outline">{statusLabel(status)}</Badge>
                </div>
                <p className="font-mono text-xs break-all">
                  {build.version} · {build.revision ?? unknown}
                  {build.dirty ? ` · ${t("deploymentAbout.modified")}` : ""}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t(
                    build.development
                      ? "deploymentAbout.startedAt"
                      : "deploymentAbout.builtAt",
                    { date: date(build.builtAt) },
                  )}
                </p>
                {expected && (
                  <p className="text-muted-foreground text-xs break-all">
                    {t("deploymentAbout.expected", {
                      value:
                        [expected.version, expected.revision]
                          .filter(Boolean)
                          .join(" · ") || unknown,
                    })}
                  </p>
                )}
                {expected?.image && (
                  <p className="text-muted-foreground font-mono text-[11px] break-all">
                    {expected.image}
                  </p>
                )}
              </section>
            );
          })}
          {(manifest?.components ?? [])
            .filter(
              (component) =>
                component.id !== "frontend" && component.id !== "backend",
            )
            .map((component) => (
              <section
                key={component.id}
                className="min-w-0 space-y-2 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{component.name}</h3>
                  <Badge variant="outline">
                    {statusLabel(
                      diagnostics.components.find(
                        (entry) => entry.id === component.id,
                      )?.status ?? "unverified",
                    )}
                  </Badge>
                </div>
                <p className="font-mono text-xs break-all">
                  {component.version ?? component.revision ?? unknown}
                </p>
                {component.image && (
                  <p className="text-muted-foreground font-mono text-[11px] break-all">
                    {component.image}
                  </p>
                )}
                {component.observation && (
                  <p className="text-muted-foreground text-xs">
                    {t("deploymentAbout.checkedAt", {
                      date: date(component.observation.checkedAt),
                    })}
                  </p>
                )}
              </section>
            ))}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t("deploymentAbout.evidenceHelp")}
        </p>
        <Button
          variant="outline"
          className="w-full cursor-pointer sm:w-auto sm:justify-self-end"
          onClick={() => void copyDiagnostics()}
        >
          <Copy className="size-4" />
          {t("deploymentAbout.copy")}
        </Button>
        {showCopyFallback && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
              {t("deploymentAbout.copyManually")}
            </p>
            <Textarea
              ref={copyRef}
              readOnly
              value={diagnosticText}
              aria-label={t("deploymentAbout.diagnostics")}
              className="max-h-48 font-mono text-xs"
              rows={6}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
