import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import {
  cacheDraft,
  draftFromVersion,
  draftsEqual,
  forgetDraft,
  newDeploymentDraft,
  nextVersionNumber,
  prepareConfiguration,
  readDraft,
  sortVersions,
} from "@/lib/deployment-workspace";
import type {
  DeploymentDraft,
  DeploymentVersion,
} from "@/lib/deployment-workspace";

/** Mounted with a device key: a late response can never replace another device's draft. */
export function useDeploymentWorkspace(deviceId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const versionsQuery = useQuery(
    trpc.getDeploymentVersions.queryOptions({ device_id: deviceId }),
  );
  const versions = sortVersions(
    (versionsQuery.data ?? []).filter((v) => v.device_id === deviceId),
  );
  const [draft, setDraft] = useState<DeploymentDraft | null>(null);
  const [baseline, setBaseline] = useState<DeploymentDraft>(newDeploymentDraft);
  const [activeVersion, setActiveVersion] = useState<
    DeploymentVersion | undefined
  >();
  const versionId = activeVersion?.id ?? null;
  const [isBusy, setIsBusy] = useState(false);
  const [isRestored, setIsRestored] = useState(false);
  const initialized = useRef(false);
  const saving = useRef(false);
  const create = useMutation(trpc.createDeployment.mutationOptions());
  const update = useMutation(trpc.updateDeployment.mutationOptions());
  const remove = useMutation(trpc.deleteDeployment.mutationOptions());

  useEffect(() => {
    if (initialized.current || !versionsQuery.data) return;
    initialized.current = true;
    const available = sortVersions(
      versionsQuery.data.filter((v) => v.device_id === deviceId),
    );
    const cached = readDraft(deviceId);
    const version = cached
      ? available.find((v) => v.id === cached.versionId)
      : available[0];
    // A deleted version's local edits become a new draft, never another version.
    const saved = version ? draftFromVersion(version) : newDeploymentDraft();
    setActiveVersion(version);
    setBaseline(saved);
    setDraft(cached?.draft ?? saved);
    setIsRestored(!!cached && !draftsEqual(cached.draft, saved));
  }, [deviceId, versionsQuery.data]);

  useEffect(() => {
    if (draft) cacheDraft(deviceId, versionId, draft);
  }, [deviceId, versionId, draft]);

  const hasChanges = !!draft && !draftsEqual(draft, baseline);
  function selectVersion(id: string) {
    const version = versions.find((v) => v.id === id);
    if (!version) return;
    const saved = draftFromVersion(version);
    setActiveVersion(version);
    setDraft(saved);
    setBaseline(saved);
    setIsRestored(false);
  }

  function discard() {
    setDraft(baseline);
    setIsRestored(false);
    cacheDraft(deviceId, versionId, baseline);
  }

  async function save(asNew = false): Promise<DeploymentVersion | null> {
    if (!draft || saving.current) return null;
    if (!draft.name.trim()) {
      toast.error(t("deployments.workspace.nameRequired"));
      return null;
    }
    saving.current = true;
    setIsBusy(true);
    try {
      const shouldCreate = asNew || !activeVersion;
      // Fetch before allocating a number, rather than trusting a possibly stale cache.
      const latest = shouldCreate
        ? await queryClient.fetchQuery({
            ...trpc.getDeploymentVersions.queryOptions({ device_id: deviceId }),
            staleTime: 0,
          })
        : versions;
      const version = shouldCreate
        ? nextVersionNumber(latest)
        : activeVersion.version;
      const configuration = prepareConfiguration(draft, version);
      const input = {
        device_id: deviceId,
        name: draft.name.trim(),
        description: draft.description || null,
        configuration,
      };
      const saved = shouldCreate
        ? await create.mutateAsync({ ...input, version })
        : await update.mutateAsync({ ...input, id: activeVersion.id });
      const normalized = draftFromVersion(saved);
      queryClient.setQueryData(
        trpc.getDeploymentVersions.queryKey({ device_id: deviceId }),
        (old) => [saved, ...(old ?? []).filter((v) => v.id !== saved.id)],
      );
      setActiveVersion(saved);
      setDraft(normalized);
      setBaseline(normalized);
      setIsRestored(false);
      cacheDraft(deviceId, saved.id, normalized);
      toast.success(
        t("deployments.workspace.savedVersion", { version: saved.version }),
      );
      return saved;
    } catch {
      // Keep the exact draft and the pending navigation after a failed save.
      toast.error(t("deployments.workspace.saveFailed"));
      return null;
    } finally {
      saving.current = false;
      setIsBusy(false);
    }
  }

  async function deleteVersion(): Promise<boolean> {
    if (!activeVersion || saving.current) return false;
    saving.current = true;
    setIsBusy(true);
    try {
      await remove.mutateAsync({ id: activeVersion.id });
      queryClient.setQueryData(
        trpc.getDeploymentVersions.queryKey({ device_id: deviceId }),
        (old) => (old ?? []).filter((v) => v.id !== activeVersion.id),
      );
      const next = versions.find((v) => v.id !== activeVersion.id);
      const saved = next ? draftFromVersion(next) : newDeploymentDraft();
      setActiveVersion(next);
      setDraft(saved);
      setBaseline(saved);
      setIsRestored(false);
      forgetDraft(deviceId);
      toast.success(t("deployments.workspace.versionDeleted"));
      return true;
    } catch {
      toast.error(t("deployments.workspace.deleteFailed"));
      return false;
    } finally {
      saving.current = false;
      setIsBusy(false);
    }
  }

  return {
    draft,
    setDraft,
    activeVersion,
    versions,
    versionsQuery,
    hasChanges,
    isBusy,
    isRestored,
    selectVersion,
    discard,
    save,
    deleteVersion,
  };
}
