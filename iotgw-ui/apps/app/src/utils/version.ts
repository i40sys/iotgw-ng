import packageJson from "../../../../package.json";

/**
 * Get the application version from the main package.json
 */
export function getAppVersion(): string {
  return packageJson.version;
}
