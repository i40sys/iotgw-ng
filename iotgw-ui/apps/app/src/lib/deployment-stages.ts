export type DeploymentStep =
  | "booting-live"
  | "os-installation"
  | "rebooting"
  | "provisioning";
export const DEPLOYMENT_STEPS: { id: DeploymentStep; labelKey: string }[] = [
  { id: "booting-live", labelKey: "deployments.workspace.bootTitle" },
  { id: "os-installation", labelKey: "deployments.workspace.installTitle" },
  { id: "rebooting", labelKey: "deployments.workspace.rebootTitle" },
  { id: "provisioning", labelKey: "deployments.workspace.provisionTitle" },
];
