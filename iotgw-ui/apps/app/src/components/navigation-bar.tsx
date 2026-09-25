import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faCheck,
  faGear,
  faMoon,
  faSun,
  faDisplay,
  faRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import { getAppVersion } from "@/utils/version";
import { signOut, useSession } from "@/lib/auth";
import { queryClient } from "@/utils/trpc";
import { NAV_SECTIONS, findActiveSection } from "./navigation/nav-config";
import { SectionNav } from "./section-nav";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
] as const;

const THEMES = [
  { value: "light", labelKey: "navigation.themeLight", icon: faSun },
  { value: "dark", labelKey: "navigation.themeDark", icon: faMoon },
  { value: "system", labelKey: "navigation.themeSystem", icon: faDisplay },
] as const;

function Brand() {
  return (
    <Link
      to="/"
      className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight"
    >
      <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent dark:from-blue-400 dark:via-purple-400 dark:to-blue-400">
        Edge
      </span>
      <span className="text-foreground -ml-1">Manager</span>
    </Link>
  );
}

/**
 * Language + theme + version in one menu. They are preferences, not features,
 * so they no longer compete with the section links for attention.
 */
function PreferencesMenu() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const version = getAppVersion();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("navigation.preferences")}
        >
          <FontAwesomeIcon icon={faGear} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {t("navigation.language")}
        </DropdownMenuLabel>
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => void i18n.changeLanguage(lang.code)}
            className="justify-between"
          >
            {lang.label}
            {i18n.language.startsWith(lang.code) && (
              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {t("navigation.theme")}
        </DropdownMenuLabel>
        {THEMES.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onClick={() => setTheme(item.value)}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <FontAwesomeIcon
                icon={item.icon}
                className="text-muted-foreground h-3.5 w-3.5"
                aria-hidden="true"
              />
              {t(item.labelKey)}
            </span>
            {theme === item.value && (
              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="text-muted-foreground px-2 py-1.5 font-mono text-xs">
          v{version}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The signed-in operator (decision-034) and the sign-out action. */
function OperatorMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const session = useSession();
  const email = session?.user.email;

  const handleSignOut = async () => {
    await signOut();
    queryClient.clear();
    await router.navigate({ to: "/login" });
  };

  return (
    <div className="flex items-center gap-1">
      {email && (
        <span
          className="text-muted-foreground hidden max-w-56 truncate text-sm sm:inline"
          title={email}
          data-testid="operator-email"
        >
          {email}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("auth.signOut")}
        title={t("auth.signOut")}
        onClick={() => void handleSignOut()}
      >
        <FontAwesomeIcon icon={faRightFromBracket} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function NavigationBar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeSection = findActiveSection(pathname);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <header className="bg-background border-border sticky top-0 z-40 border-b">
      <nav
        aria-label={t("navigation.primary")}
        className="mx-auto flex h-14 max-w-screen-2xl items-center gap-6 px-4"
      >
        <Brand />

        {/* Section tabs — the four things you can do in the product. */}
        <ul className="hidden h-full items-stretch gap-1 md:flex">
          {NAV_SECTIONS.map((section) => {
            const isActive = section.id === activeSection.id;
            return (
              <li key={section.id} className="flex">
                <Link
                  to={section.to}
                  aria-current={isActive ? "page" : undefined}
                  title={t(section.descriptionKey)}
                  className={cn(
                    "relative flex items-center gap-2 px-3 text-sm transition-colors",
                    "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors",
                    isActive
                      ? "text-foreground after:bg-primary font-medium"
                      : "text-muted-foreground hover:text-foreground after:bg-transparent",
                  )}
                >
                  <FontAwesomeIcon
                    icon={section.icon}
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  {t(section.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-1">
          <OperatorMenu />
          <PreferencesMenu />

          {/* Mobile: whole tree in a sheet. */}
          <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t("navigation.openMenu")}
              >
                <FontAwesomeIcon icon={faBars} aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>
                  <Brand />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-5 px-4 pb-6">
                {NAV_SECTIONS.map((section) => (
                  <div key={section.id} className="flex flex-col gap-1">
                    <Link
                      to={section.to}
                      onClick={() => setIsMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2 text-sm font-semibold",
                        section.id === activeSection.id
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <FontAwesomeIcon
                        icon={section.icon}
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      {t(section.labelKey)}
                    </Link>
                    {section.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setIsMobileOpen(false)}
                        className="text-muted-foreground hover:text-foreground [&.active]:text-primary flex items-center gap-2 py-1 pl-6 text-sm"
                      >
                        <FontAwesomeIcon
                          icon={item.icon}
                          className="h-3 w-3"
                          aria-hidden="true"
                        />
                        {t(item.labelKey)}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <SectionNav section={activeSection} />
    </header>
  );
}
