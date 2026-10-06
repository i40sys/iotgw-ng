/**
 * Open an in-app page (e.g. a job's debug logs) in a new tab, leaving the
 * current one where it is. A link click with target="_blank" is used instead
 * of window.open: some browsers (embedded ones especially) open the tab but
 * still return null from window.open, and navigating the current tab as a
 * "fallback" then loaded the page in both. Never navigate the current tab.
 */
export function openPage(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.click();
}
