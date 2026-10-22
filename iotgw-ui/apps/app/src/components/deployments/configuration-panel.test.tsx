import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeploymentConfigurationPanel } from "./configuration-panel";
import type {
  DeploymentDraft,
  DeploymentVersion,
} from "@/lib/deployment-workspace";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

const savedVersion = {
  id: "device-a-v1",
  device_id: "device-a",
  version: "1",
  name: "Baseline",
  description: "",
  configuration: {},
  created_at: "2026-09-20T10:00:00Z",
  modified_at: "2026-09-28T10:00:00Z",
  created_by: null,
  modified_by: null,
  short: null,
} as DeploymentVersion;

const draft: DeploymentDraft = {
  name: "Baseline",
  description: "",
  configurationJson: "{}",
};

function renderPanel(
  props: Partial<{
    draft: DeploymentDraft;
    version: DeploymentVersion;
    hasChanges: boolean;
    isBusy: boolean;
  }> = {},
) {
  const handlers = {
    onSave: vi.fn(),
    onSaveNew: vi.fn(),
    onDiscard: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <DeploymentConfigurationPanel
      draft={props.draft ?? draft}
      onChange={vi.fn()}
      version={props.version}
      versions={props.version ? [props.version] : []}
      hasChanges={props.hasChanges ?? false}
      isBusy={props.isBusy ?? false}
      isRestored={false}
      onSelectVersion={vi.fn()}
      {...handlers}
    />,
  );
  return handlers;
}

const button = (name: string) => screen.getByRole("button", { name });

function expectStates(states: Record<string, boolean>) {
  for (const [name, isEnabled] of Object.entries(states)) {
    if (isEnabled) expect(button(name)).toBeEnabled();
    else expect(button(name)).toBeDisabled();
  }
}

describe("DeploymentConfigurationPanel actions", () => {
  it("shows the actions as buttons instead of a header menu", () => {
    renderPanel({ version: savedVersion });
    expect(
      screen.getByRole("group", {
        name: "deployments.workspace.configurationActions",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button")
        .filter((b) => b.getAttribute("aria-haspopup") === "menu"),
    ).toHaveLength(0);
  });

  it("new draft: save and save-as-new enabled, discard and delete disabled", () => {
    renderPanel({ hasChanges: true });
    expectStates({
      "deployments.workspace.saveConfiguration": true,
      "deployments.workspace.saveNewVersion": true,
      "deployments.workspace.discardEdits": true,
      "deployments.workspace.deleteVersion": false,
    });
  });

  it("unnamed new draft without changes: every action disabled", () => {
    renderPanel({ draft: { ...draft, name: "  " } });
    expectStates({
      "deployments.workspace.saveConfiguration": false,
      "deployments.workspace.saveNewVersion": false,
      "deployments.workspace.discardEdits": false,
      "deployments.workspace.deleteVersion": false,
    });
  });

  it("saved version without changes: save and discard disabled", () => {
    renderPanel({ version: savedVersion });
    expectStates({
      "deployments.workspace.saveChanges": false,
      "deployments.workspace.saveNewVersion": true,
      "deployments.workspace.discardEdits": false,
      "deployments.workspace.deleteVersion": true,
    });
  });

  it("saved version with unsaved changes: every action enabled and wired", () => {
    const handlers = renderPanel({ version: savedVersion, hasChanges: true });
    expectStates({
      "deployments.workspace.saveChanges": true,
      "deployments.workspace.saveNewVersion": true,
      "deployments.workspace.discardEdits": true,
      "deployments.workspace.deleteVersion": true,
    });
    fireEvent.click(button("deployments.workspace.saveChanges"));
    fireEvent.click(button("deployments.workspace.saveNewVersion"));
    fireEvent.click(button("deployments.workspace.discardEdits"));
    fireEvent.click(button("deployments.workspace.deleteVersion"));
    expect(handlers.onSave).toHaveBeenCalledOnce();
    expect(handlers.onSaveNew).toHaveBeenCalledOnce();
    expect(handlers.onDiscard).toHaveBeenCalledOnce();
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  it("busy: every action disabled", () => {
    renderPanel({ version: savedVersion, hasChanges: true, isBusy: true });
    expectStates({
      "common.saving": false,
      "deployments.workspace.saveNewVersion": false,
      "deployments.workspace.discardEdits": false,
      "deployments.workspace.deleteVersion": false,
    });
  });
});
