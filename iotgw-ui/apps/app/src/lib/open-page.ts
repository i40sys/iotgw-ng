/**
 * Open an in-app page (e.g. a job's debug logs) in a new tab when the browser
 * allows it, otherwise in the current tab. Embedded browsers block popups
 * silently: a bare window.open(url, "_blank") then does nothing at all.
 */
export function openPage(url: string): void {
  const opened = window.open(url, "_blank");
  if (!opened) {
    window.location.assign(url);
  }
}
