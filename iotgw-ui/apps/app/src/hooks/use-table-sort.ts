import { useCallback, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/** Per-column value extractor; return string | number | null (null sorts last). */
export type SortAccessors<T, K extends string> = Record<
  K,
  (row: T) => string | number | null | undefined
>;

/** Compare dotted IPv4 addresses numerically; falls back to string compare. */
export function ipSortValue(ip: string | null | undefined): number | null {
  if (!ip) return null;
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return null;
  return octets.reduce((acc, n) => acc * 256 + n, 0);
}

function compare(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Client-side column sorting for small tables. Clicking the same column cycles
 * asc -> desc -> unsorted (original order); a different column starts at asc.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  accessors: SortAccessors<T, K>,
  initial: SortState<K> | null = null,
) {
  const [sort, setSort] = useState<SortState<K> | null>(initial);

  const toggleSort = useCallback((key: K) => {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const accessor = accessors[sort.key];
    const sign = sort.direction === "asc" ? 1 : -1;
    // Stable: ties keep their incoming order.
    return rows
      .map((row, index) => ({ row, index }))
      .sort(
        (a, b) =>
          sign * compare(accessor(a.row), accessor(b.row)) || a.index - b.index,
      )
      .map(({ row }) => row);
  }, [rows, sort, accessors]);

  return { sort, toggleSort, sortedRows };
}
