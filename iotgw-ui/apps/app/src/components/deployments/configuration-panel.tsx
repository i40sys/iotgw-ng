import {
  FileSliders,
  MoreHorizontal,
  Save,
  Copy,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  DeploymentDraft,
  DeploymentVersion,
} from "@/lib/deployment-workspace";

export function DeploymentConfigurationPanel({
  draft,
  onChange,
  version,
  versions,
  hasChanges,
  isBusy,
  isRestored,
  onSelectVersion,
  onSave,
  onSaveNew,
  onDiscard,
  onDelete,
}: {
  draft: DeploymentDraft;
  onChange: (draft: DeploymentDraft) => void;
  version?: DeploymentVersion;
  versions: DeploymentVersion[];
  hasChanges: boolean;
  isBusy: boolean;
  isRestored: boolean;
  onSelectVersion: (id: string) => void;
  onSave: () => void;
  onSaveNew: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <section
      className="bg-card max-w-3xl min-w-0 rounded-xl border"
      aria-labelledby="configuration-heading"
      data-slot="deployment-configuration"
    >
      <div className="flex items-center justify-between gap-2 border-b p-5 sm:p-6">
        <h2
          id="configuration-heading"
          className="flex min-w-0 items-center gap-2 text-lg font-semibold"
        >
          <FileSliders className="text-muted-foreground size-4" />
          {t("deployments.workspace.configuration")}
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={isBusy}
              aria-label={t("deployments.workspace.configurationActions")}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={onSaveNew}
              disabled={!draft.name.trim()}
            >
              <Copy className="size-4" />
              {t("deployments.workspace.saveNewVersion")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDiscard} disabled={!hasChanges}>
              <RotateCcw className="size-4" />
              {t("deployments.workspace.discardEdits")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              disabled={!version}
              className="text-destructive"
            >
              <Trash2 className="size-4" />
              {t("deployments.workspace.deleteVersion")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <fieldset
        id="configuration-fields"
        disabled={isBusy}
        className="min-w-0 space-y-4 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Badge
            variant="outline"
            className={
              hasChanges || !version
                ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
                : "text-muted-foreground"
            }
          >
            {!version
              ? t("deployments.workspace.newDraft")
              : hasChanges
                ? t("deployments.workspace.unsaved")
                : t("deployments.workspace.saved")}
          </Badge>
          {version && (
            <span className="text-muted-foreground text-xs">
              v{version.version}
            </span>
          )}
        </div>
        {isRestored && (
          <p className="text-muted-foreground text-xs">
            {t("deployments.workspace.restoredDraft")}
          </p>
        )}
        {versions.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="deployment-version">
              {t("deployments.workspace.savedConfiguration")}
            </Label>
            <Select
              value={version?.id ?? "draft"}
              onValueChange={onSelectVersion}
              disabled={isBusy}
            >
              <SelectTrigger
                id="deployment-version"
                className="w-full min-w-0 [&>span]:truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!version && (
                  <SelectItem value="draft" disabled>
                    {t("deployments.workspace.newDraft")}
                  </SelectItem>
                )}
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.version} · {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="deployment-name">
            {t("deployments.workspace.configurationName")}
          </Label>
          <Input
            id="deployment-name"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder={t("deployments.workspace.namePlaceholder")}
          />
        </div>
        <details className="group">
          <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
            {t("deployments.workspace.notesOptional")}
          </summary>
          <Textarea
            aria-label={t("deployments.description")}
            value={draft.description}
            onChange={(e) =>
              onChange({ ...draft, description: e.target.value })
            }
            rows={3}
            className="mt-2"
          />
        </details>
        <Button
          variant={hasChanges || !version ? "default" : "outline"}
          className="w-full sm:w-auto"
          disabled={isBusy || (!hasChanges && !!version) || !draft.name.trim()}
          onClick={onSave}
        >
          <Save className="size-4" />
          {isBusy
            ? t("common.saving")
            : version
              ? t("deployments.workspace.saveChanges")
              : t("deployments.workspace.saveConfiguration")}
        </Button>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t("deployments.workspace.saveHelp")}
        </p>
        {version?.modified_at && (
          <p className="text-muted-foreground border-t pt-3 text-xs">
            {t("deployments.workspace.lastSaved", {
              date: new Date(version.modified_at).toLocaleString(
                i18n.language,
                { dateStyle: "medium", timeStyle: "short" },
              ),
            })}
          </p>
        )}
      </fieldset>
    </section>
  );
}
