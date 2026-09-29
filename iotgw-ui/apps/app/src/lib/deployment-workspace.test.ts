import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheDraft,
  draftFromVersion,
  draftsEqual,
  nextVersionNumber,
  prepareConfiguration,
  readDraft,
  sortVersions,
} from "./deployment-workspace";
import type { DeploymentVersion } from "./deployment-workspace";

function version(number: string): DeploymentVersion {
  return {
    id: `version-${number}`,
    device_id: "device-a",
    version: number,
    name: "Gateway baseline",
    description: null,
    configuration: {
      name: "Old name",
      version: "1",
      custom_extension: { keep: true },
      osInstallation: { target_disk: "/dev/sda" },
    },
    created_at: null,
    created_by: null,
    modified_at: null,
    modified_by: null,
    short: null,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("deployment drafts", () => {
  it("saves the visible name and allocated version without dropping extensions", () => {
    const draft = {
      ...draftFromVersion(version("2")),
      name: "  Gateway production  ",
    };
    expect(prepareConfiguration(draft, "3")).toEqual({
      name: "Gateway production",
      version: "3",
      custom_extension: { keep: true },
      osInstallation: { target_disk: "/dev/sda" },
    });
  });
  it("does not treat formatting-only edits as unsaved", () => {
    const draft = draftFromVersion(version("2"));
    expect(
      draftsEqual(draft, {
        ...draft,
        configurationJson: JSON.stringify(JSON.parse(draft.configurationJson)),
      }),
    ).toBe(true);
    expect(draftsEqual(draft, { ...draft, configurationJson: "{" })).toBe(
      false,
    );
  });
  it("rejects invalid or non-object JSON and empty names before a mutation", () => {
    const draft = draftFromVersion(version("1"));
    for (const json of ["{", "[]", "null", "123"])
      expect(() =>
        prepareConfiguration({ ...draft, configurationJson: json }, "2"),
      ).toThrow();
    expect(() => prepareConfiguration({ ...draft, name: " " }, "2")).toThrow();
  });
  it("orders numeric version strings correctly and handles missing timestamps", () => {
    const versions = [version("2"), version("10"), version("1")];
    expect(sortVersions(versions).map((v) => v.version)).toEqual([
      "10",
      "2",
      "1",
    ]);
    expect(nextVersionNumber(versions)).toBe("11");
    expect(nextVersionNumber([])).toBe("1");
  });
  it("restores only the requested device's draft", () => {
    const draft = draftFromVersion(version("1"));
    cacheDraft("device-a", "version-1", draft);
    expect(readDraft("device-a")).toMatchObject({
      deviceId: "device-a",
      versionId: "version-1",
      draft,
    });
    expect(readDraft("device-b")).toBeNull();
    sessionStorage.setItem(
      "iotgw-deployment-draft-v2:device-b",
      sessionStorage.getItem("iotgw-deployment-draft-v2:device-a")!,
    );
    expect(readDraft("device-b")).toBeNull();
  });
  it("ignores corrupt storage while preserving invalid JSON for later repair", () => {
    sessionStorage.setItem("iotgw-deployment-draft-v2:device-a", "{");
    expect(readDraft("device-a")).toBeNull();
    cacheDraft("device-a", null, {
      name: "Draft",
      description: "",
      configurationJson: "{",
    });
    expect(readDraft("device-a")?.draft.configurationJson).toBe("{");
  });
  it("migrates a legacy draft only when its selected version belongs to the target", () => {
    const legacy = {
      selectedDeviceId: "device-a",
      selectedVersion: { id: "version-1", device_id: "device-a" },
      formName: "Unsaved legacy draft",
      formDescription: "",
      configurationJson: "{}",
    };
    localStorage.setItem("iotgw-deployment-settings", JSON.stringify(legacy));
    expect(readDraft("device-b")).toBeNull();
    const restored = readDraft("device-a")!;
    expect(restored.draft.name).toBe("Unsaved legacy draft");
    cacheDraft("device-a", restored.versionId, restored.draft);
    expect(localStorage.getItem("iotgw-deployment-settings")).toBeNull();
    localStorage.setItem(
      "iotgw-deployment-settings",
      JSON.stringify({ ...legacy, selectedDeviceId: "device-b" }),
    );
    expect(readDraft("device-b")).toBeNull();
  });
});
