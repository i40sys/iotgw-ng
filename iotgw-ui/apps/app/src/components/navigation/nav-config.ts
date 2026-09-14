import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import {
  faChartSimple,
  faClipboardList,
  faGlobe,
  faLayerGroup,
  faNetworkWired,
  faRocket,
  faServer,
  faWaveSquare,
} from "@fortawesome/free-solid-svg-icons";

// Every route the UI exposes is a leaf under one of four sections. The
// section is what the top bar shows; the leaves become the section sub-nav.
// This is the single source of truth for both bars and the mobile sheet —
// add a page here, not in the components.
export type NavSectionId = "overview" | "inventory" | "deploy" | "activity";

export interface NavItem {
  to: string;
  labelKey: string;
  descriptionKey?: string;
  icon: IconDefinition;
}

export interface NavSection {
  id: NavSectionId;
  to: string;
  labelKey: string;
  descriptionKey: string;
  icon: IconDefinition;
  /** Path prefixes that mean "you are inside this section". Longest wins. */
  matches: string[];
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    to: "/",
    labelKey: "navigation.overview",
    descriptionKey: "navigation.overviewDescription",
    icon: faChartSimple,
    matches: ["/"],
    items: [],
  },
  {
    id: "inventory",
    to: "/domains",
    labelKey: "navigation.inventory",
    descriptionKey: "navigation.inventoryDescription",
    icon: faLayerGroup,
    matches: ["/domains", "/networks", "/devices"],
    // Ordered as the data model nests: Domain ⊃ Network ⊃ Device (doc-008).
    items: [
      {
        to: "/domains",
        labelKey: "navigation.domains",
        descriptionKey: "domains.description",
        icon: faGlobe,
      },
      {
        to: "/networks",
        labelKey: "navigation.networks",
        descriptionKey: "networks.description",
        icon: faNetworkWired,
      },
      {
        to: "/devices",
        labelKey: "navigation.devices",
        descriptionKey: "navigation.devicesDescription",
        icon: faServer,
      },
    ],
  },
  {
    id: "deploy",
    to: "/deployments",
    labelKey: "navigation.deploy",
    descriptionKey: "deployments.pageDescription",
    icon: faRocket,
    matches: ["/deployments"],
    items: [],
  },
  {
    id: "activity",
    to: "/deployments/jobs",
    labelKey: "navigation.activity",
    descriptionKey: "navigation.activityDescription",
    icon: faWaveSquare,
    // The three job tables were split across "Jobs" and "Debug"; they are one
    // concept (what the platform did, and whether it worked), so they live
    // together here. Route paths are unchanged.
    matches: ["/deployments/jobs", "/debug"],
    items: [
      {
        to: "/deployments/jobs",
        labelKey: "navigation.deploymentJobsFull",
        descriptionKey: "deploymentJobs.pageDescription",
        icon: faClipboardList,
      },
      {
        to: "/debug/device-jobs",
        labelKey: "navigation.deviceJobs",
        descriptionKey: "deviceJobs.pageDescription",
        icon: faServer,
      },
      {
        to: "/debug/network-jobs",
        labelKey: "navigation.networkJobs",
        descriptionKey: "networkJobs.pageDescription",
        icon: faNetworkWired,
      },
    ],
  },
];

/** Resolve which section a pathname belongs to (longest matching prefix). */
export function findActiveSection(pathname: string): NavSection {
  let best: NavSection = NAV_SECTIONS[0];
  let bestLen = -1;
  for (const section of NAV_SECTIONS) {
    for (const prefix of section.matches) {
      const isMatch =
        prefix === "/"
          ? pathname === "/"
          : pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (isMatch && prefix.length > bestLen) {
        best = section;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}
