import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SortState } from "@/hooks/use-table-sort";
import { cn } from "@/lib/utils";

interface SearchField {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

export function InventoryToolbar<K extends string>({
  searches,
  sort,
  onSortChange,
  sortOptions,
  count,
  total,
  onRefresh,
  isRefreshing,
}: {
  searches: SearchField[];
  sort: SortState<K> | null;
  onSortChange: (sort: SortState<K> | null) => void;
  sortOptions: { key: K; label: string }[];
  count: number;
  total: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const hasFilters = searches.some((search) => search.value.length > 0);

  return (
    <div className="space-y-4 border-b p-4 sm:p-6">
      <div
        className={cn(
          "grid gap-4 @2xl:grid-cols-2",
          searches.length > 1 && "@4xl:grid-cols-[1fr_1fr_16rem]",
        )}
      >
        {searches.map((search, index) => (
          <div key={search.label} className="min-w-0 space-y-2">
            <Label htmlFor={`${id}-search-${index}`}>{search.label}</Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-3.5 left-3 size-4"
              />
              <Input
                id={`${id}-search-${index}`}
                type="search"
                value={search.value}
                placeholder={search.placeholder}
                onChange={(event) => search.onChange(event.target.value)}
                className="h-11 min-w-0 pr-11 pl-9 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {search.value && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 right-0 size-11"
                  aria-label={t("inventory.clearSearch", {
                    field: search.label,
                  })}
                  onClick={() => search.onChange("")}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-sort`}>{t("inventory.sortBy")}</Label>
          <div className="flex gap-2">
            <select
              id={`${id}-sort`}
              value={sort?.key ?? ""}
              className="border-input bg-background focus-visible:ring-ring h-11 min-w-0 flex-1 rounded-md border px-3 text-sm focus-visible:ring-2"
              onChange={(event) => {
                const option = sortOptions.find(
                  (entry) => entry.key === event.target.value,
                );
                onSortChange(
                  option
                    ? { key: option.key, direction: sort?.direction ?? "asc" }
                    : null,
                );
              }}
            >
              <option value="">{t("inventory.defaultOrder")}</option>
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              disabled={!sort}
              aria-label={t(
                sort?.direction === "asc"
                  ? "inventory.sortDescending"
                  : "inventory.sortAscending",
              )}
              onClick={() =>
                sort &&
                onSortChange({
                  ...sort,
                  direction: sort.direction === "asc" ? "desc" : "asc",
                })
              }
            >
              {sort?.direction === "desc" ? (
                <ArrowDown aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" className="text-muted-foreground text-sm">
          {t("inventory.results", { count, total })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 @5xl:min-h-9"
              onClick={() => searches.forEach((search) => search.onChange(""))}
            >
              {t("inventory.clearFilters")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 @5xl:min-h-9"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn("size-4", isRefreshing && "animate-spin")}
            />
            {t("inventory.refresh")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface InventoryColumn<T, K extends string> {
  key: string;
  label: string;
  sortKey?: K;
  className?: string;
  render: (row: T) => ReactNode;
}

export function InventoryList<T extends { id: string }, K extends string>({
  rows,
  columns,
  sort,
  onSort,
  actions,
  label,
  emptyMessage,
}: {
  rows: T[];
  columns: InventoryColumn<T, K>[];
  sort: SortState<K> | null;
  onSort: (key: K) => void;
  actions: (row: T) => ReactNode;
  label: string;
  emptyMessage: string;
}) {
  const { t } = useTranslation();
  if (!rows.length) {
    return (
      <div
        className="text-muted-foreground px-6 py-14 text-center text-sm"
        role="status"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="hidden @5xl:block">
        <Table className="table-fixed" aria-label={label}>
          <TableHeader>
            <TableRow>
              {columns.map((column) =>
                column.sortKey ? (
                  <SortableTableHead
                    key={column.key}
                    sortKey={column.sortKey}
                    sort={sort}
                    onSort={onSort}
                    className={column.className}
                  >
                    {column.label}
                  </SortableTableHead>
                ) : (
                  <TableHead
                    key={column.key}
                    className={cn("px-3", column.className)}
                  >
                    {column.label}
                  </TableHead>
                ),
              )}
              <TableHead className="w-44 px-3">
                {t("inventory.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className="px-3 py-4 align-top [overflow-wrap:anywhere]"
                  >
                    {column.render(row)}
                  </TableCell>
                ))}
                <TableCell className="px-3 py-4 align-top">
                  {actions(row)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul
        aria-label={label}
        className="grid gap-4 p-4 sm:p-6 @2xl:grid-cols-2 @5xl:hidden"
      >
        {rows.map((row) => (
          <li
            key={row.id}
            className="bg-background flex min-w-0 flex-col rounded-lg border p-4 [overflow-wrap:anywhere]"
          >
            <div className="mb-4 min-w-0">{columns[0]?.render(row)}</div>
            <dl className="flex-1 space-y-4 text-sm">
              {columns.slice(1).map((column) => (
                <div key={column.key} className="min-w-0">
                  <dt className="text-muted-foreground mb-1 text-xs font-medium">
                    {column.label}
                  </dt>
                  <dd>{column.render(row)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t pt-4">{actions(row)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function InventoryActions({
  name,
  primary,
  children,
  disabled,
}: {
  name: string;
  primary: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 @5xl:flex-col @5xl:items-stretch [&>a]:min-h-11 [&>a]:flex-1 [&>a]:whitespace-normal @5xl:[&>a]:min-h-9">
      {primary}
      {/* Row dialogs manage their own focus and pointer lock. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 @5xl:min-h-9"
            disabled={disabled}
            aria-label={t("inventory.moreFor", { name })}
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
            {t("inventory.more")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-w-[calc(100vw-2rem)] min-w-48 [&>[role=menuitem]]:min-h-11"
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function InventoryDate({ value }: { value: string | null }) {
  const { t, i18n } = useTranslation();
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()))
    return (
      <span className="text-muted-foreground">
        {t("inventory.notAvailable")}
      </span>
    );
  return (
    <time dateTime={value ?? undefined} className="block space-y-1 text-sm">
      <span className="block">
        {date.toLocaleDateString(i18n.resolvedLanguage, {
          dateStyle: "medium",
        })}
      </span>
      <span className="text-muted-foreground block text-xs">
        {date.toLocaleTimeString(i18n.resolvedLanguage, { timeStyle: "short" })}
      </span>
    </time>
  );
}
