export interface BuildInfo {
  component: "frontend" | "backend";
  version: string;
  revision: string | null;
  release: string | null;
  builtAt: string;
  dirty: boolean | null;
  development: boolean;
}

export function getBuildInfo(
  component: BuildInfo["component"],
  options?: {
    development?: boolean;
    env?: Record<string, string | undefined>;
  },
): BuildInfo;
