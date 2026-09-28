import { describe, expect, it } from "vitest";
import { applyFieldChange } from "./deployment-config-form";

describe("applyFieldChange — stack flag ⇄ __tags__ sync", () => {
  it("ticking a stack tag turns the stack on", () => {
    const next = applyFieldChange(
      { credentials: false, __tags__: ["system"] },
      ["__tags__"],
      ["system", "credentials"],
    );
    expect(next.credentials).toBe(true);
  });

  it("unticking a stack tag turns the stack off", () => {
    const next = applyFieldChange(
      { credentials: true, __tags__: ["system", "credentials"] },
      ["__tags__"],
      ["system"],
    );
    expect(next.credentials).toBe(false);
  });

  it("switching a stack on adds its tag when tags are selected", () => {
    const next = applyFieldChange(
      { credentials: false, __tags__: ["system", "firewall"] },
      ["credentials"],
      true,
    );
    // Schema enum order: … firewall, syslog, shell, credentials, …
    expect(next.__tags__).toEqual(["system", "firewall", "credentials"]);
  });

  it("switching a stack on leaves an empty tag list empty (= all stacks)", () => {
    const next = applyFieldChange({ credentials: false, __tags__: [] }, ["credentials"], true);
    expect(next.__tags__).toEqual([]);
  });

  it("switching a stack off removes its tag", () => {
    const next = applyFieldChange(
      { credentials: true, __tags__: ["system", "credentials"] },
      ["credentials"],
      false,
    );
    expect(next.__tags__).toEqual(["system"]);
  });

  it("tags without a stack flag (ntp) touch nothing else", () => {
    const config = { credentials: false, __tags__: [] };
    expect(applyFieldChange(config, ["__tags__"], ["ntp"])).toEqual({
      credentials: false,
      __tags__: ["ntp"],
    });
  });
});
