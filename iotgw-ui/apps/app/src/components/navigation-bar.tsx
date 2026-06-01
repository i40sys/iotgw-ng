import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./language-switcher";
import { ModeToggle } from "./mode-toggle";
import { Link } from "@tanstack/react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faGlobe,
  faNetworkWired,
  faServer,
  faRocket,
  faClipboardList,
  faBug,
} from "@fortawesome/free-solid-svg-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function NavigationBar() {
  const { t } = useTranslation();

  const navItems = [
    {
      id: "/",
      label: t("navigation.home"),
      description: t("navigation.homeDescription"),
      icon: faHouse,
    },
    {
      id: "/domains",
      label: t("navigation.domains"),
      description: t("domains.description"),
      icon: faGlobe,
    },
    {
      id: "/networks",
      label: t("navigation.networks"),
      description: t("networks.description"),
      icon: faNetworkWired,
    },
    {
      id: "/devices",
      label: t("navigation.devices"),
      description: t("navigation.devicesDescription"),
      icon: faServer,
    },
    {
      id: "/deployments",
      label: t("navigation.deployments"),
      description: t("deployments.pageDescription"),
      icon: faRocket,
    },
    {
      id: "/deployments/jobs",
      label: t("navigation.deploymentJobs"),
      description: t("deploymentJobs.pageDescription"),
      icon: faClipboardList,
    },
  ];

  return (
    <nav className="bg-background border-border border-b px-4 py-2.5">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between">
        <div className="flex items-center">
          <span className="self-center whitespace-nowrap text-xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-purple-400 dark:to-blue-400">
              Edge
            </span>
            <span className="text-foreground ml-1">Manager</span>
          </span>
          <div className="ml-8 hidden md:block">
            <ul className="flex space-x-8">
              {navItems.map((item) => (
                <li key={item.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.id}
                        activeOptions={{
                          exact: item.id === "/",
                        }}
                        className="text-muted-foreground hover:text-primary [&.active]:text-primary block py-2 [&.active]:font-medium"
                      >
                        <FontAwesomeIcon
                          icon={item.icon}
                          className="mr-2"
                          aria-hidden="true"
                        />
                        {item.label}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{item.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <FontAwesomeIcon
                  icon={faBug}
                  className="mr-2"
                  aria-hidden="true"
                />
                {t("navigation.debug")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link
                  to="/debug/network-jobs"
                  className="flex w-full cursor-pointer items-center"
                >
                  <FontAwesomeIcon
                    icon={faNetworkWired}
                    className="mr-2"
                    aria-hidden="true"
                  />
                  {t("navigation.networkJobs")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to="/debug/device-jobs"
                  className="flex w-full cursor-pointer items-center"
                >
                  <FontAwesomeIcon
                    icon={faServer}
                    className="mr-2"
                    aria-hidden="true"
                  />
                  {t("navigation.deviceJobs")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <LanguageSwitcher />
          <ModeToggle />
        </div>
      </div>
    </nav>
  );
}
