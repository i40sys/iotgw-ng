import { describe, expect, it } from "vitest";
import { matchesInventorySearch } from "./inventory";

describe("matchesInventorySearch", () => {
  it("matches case-insensitive terms across visible fields", () => {
    expect(
      matchesInventorySearch(
        "  GATEWAY   barcelona  ",
        "gateway-01",
        "Barcelona production floor",
      ),
    ).toBe(true);
    expect(
      matchesInventorySearch(
        "gateway madrid",
        "gateway-01",
        "Barcelona production floor",
      ),
    ).toBe(false);
  });

  it("finds full identifiers, IPv6 addresses and CIDR ranges", () => {
    expect(
      matchesInventorySearch(
        "c842d8a9",
        "7b239524-bd82-4211-9144-756dc842d8a9",
      ),
    ).toBe(true);
    expect(matchesInventorySearch("2001:db8::1", null, "2001:db8::1")).toBe(
      true,
    );
    expect(
      matchesInventorySearch("10.4.0.0/16", "factory", "10.4.0.0/16"),
    ).toBe(true);
  });

  it("handles missing fields and blank searches", () => {
    expect(matchesInventorySearch("  ", null, undefined)).toBe(true);
    expect(matchesInventorySearch("null", null, undefined)).toBe(false);
    expect(matchesInventorySearch("unknown", undefined, "gateway")).toBe(false);
  });
});
