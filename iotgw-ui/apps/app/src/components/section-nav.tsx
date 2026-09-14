import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cn } from "@/lib/utils";
import type { NavSection } from "./navigation/nav-config";

/**
 * Second-level bar: the pages inside the active section. Rendered only when
 * the section has more than one page, so single-page sections (Overview,
 * Deploy) keep the header at one row.
 */
export function SectionNav({ section }: { section: NavSection }) {
  const { t } = useTranslation();

  if (section.items.length < 2) return null;

  return (
    <div className="bg-muted/40 border-border hidden border-t md:block">
      <ul
        aria-label={t(section.labelKey)}
        className="mx-auto flex h-10 max-w-screen-2xl items-center gap-1 px-4"
      >
        {section.items.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              title={item.descriptionKey ? t(item.descriptionKey) : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                "[&.active]:bg-background [&.active]:text-foreground [&.active]:shadow-sm [&.active]:font-medium",
              )}
            >
              <FontAwesomeIcon
                icon={item.icon}
                className="h-3.5 w-3.5"
                aria-hidden="true"
              />
              {t(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
