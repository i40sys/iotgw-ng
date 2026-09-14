import * as React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSort,
  faSortDown,
  faSortUp,
} from "@fortawesome/free-solid-svg-icons";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortState } from "@/hooks/use-table-sort";

interface SortableTableHeadProps<K extends string>
  extends Omit<React.ComponentProps<typeof TableHead>, "onClick"> {
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (key: K) => void;
}

/** Table header cell that acts as a sort toggle for its column. */
export function SortableTableHead<K extends string>({
  sortKey,
  sort,
  onSort,
  className,
  children,
  ...props
}: SortableTableHeadProps<K>) {
  const isActive = sort?.key === sortKey;
  const direction = isActive ? sort.direction : undefined;
  const icon =
    direction === "asc" ? faSortUp : direction === "desc" ? faSortDown : faSort;

  return (
    <TableHead
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn("p-0", className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "hover:text-foreground focus-visible:ring-ring inline-flex h-12 w-full items-center gap-1.5 px-3 text-left font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          isActive && "text-foreground",
        )}
      >
        {children}
        <FontAwesomeIcon
          icon={icon}
          className={cn("h-3 w-3", !isActive && "opacity-40")}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}
