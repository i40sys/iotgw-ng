import { describe, expect, it } from "vitest";
import { applyFieldChange } from "./deployment-config-form";

describe("applyFieldChange — stack flag ⇄ __tags__ sync", () => {
  it("ticking a stack tag turns the stack on", () => {
    const next = applyFieldChange(
      { duplicati: false, __tags__: ["system"] },
      ["__tags__"],
      ["system", "duplicati"],
    );
    expect(next.duplicati).toBe(true);
  });

  it("unticking a stack tag turns the stack off", () => {
    const next = applyFieldChange(
      { duplicati: true, __tags__: ["system", "duplicati"] },
      ["__tags__"],
      ["system"],
    );
    expect(next.duplicati).toBe(false);
  });

  it("switching a stack on adds its tag when tags are selected", () => {
    const next = applyFieldChange(
      { duplicati: false, __tags__: ["system", "firewall"] },
      ["duplicati"],
      true,
    );
    // Schema enum order: … firewall, …, telegraf, duplicati, …
    expect(next.__tags__).toEqual(["system", "firewall", "duplicati"]);
  });

  it("switching a stack on leaves an empty tag list empty (= all stacks)", () => {
    const next = applyFieldChange({ duplicati: false, __tags__: [] }, ["duplicati"], true);
    expect(next.__tags__).toEqual([]);
  });

  it("switching a stack off removes its tag", () => {
    const next = applyFieldChange(
      { duplicati: true, __tags__: ["system", "duplicati"] },
      ["duplicati"],
      false,
    );
    expect(next.__tags__).toEqual(["system"]);
  });

  it("tags without a stack flag (ntp) touch nothing else", () => {
    const config = { duplicati: false, __tags__: [] };
    expect(applyFieldChange(config, ["__tags__"], ["ntp"])).toEqual({
      duplicati: false,
      __tags__: ["ntp"],
    });
  });
});
