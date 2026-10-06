import { afterEach, describe, expect, it, vi } from "vitest";
import { openPage } from "./open-page";

describe("openPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens the page in a new tab through a target=_blank link", () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.getAttribute("href")).toBe("/deployments/debug/abc");
        expect(this.target).toBe("_blank");
        expect(this.rel).toBe("noopener");
      });
    openPage("/deployments/debug/abc");
    expect(click).toHaveBeenCalledOnce();
  });

  it("never navigates the current tab (no window.open/location fallback)", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    const open = vi.spyOn(window, "open");
    const before = window.location.href;
    openPage("/deployments/debug/abc");
    expect(open).not.toHaveBeenCalled();
    expect(window.location.href).toBe(before);
  });
});
