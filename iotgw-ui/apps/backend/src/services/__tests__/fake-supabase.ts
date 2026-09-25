/**
 * Minimal in-memory stand-in for the supabase-js query builder, covering only
 * what services/device-code.ts uses: select / update, eq / is / gte filters,
 * order + limit, maybeSingle, and awaiting the builder itself.
 */
type Row = Record<string, unknown>;

export function createFakeSupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;
    let projection: string[] | null = null;

    const rows = () => (tables[table] ??= []);
    const run = () => {
      let hits = rows().filter((r) => filters.every((f) => f(r)));
      if (patch) {
        for (const r of hits) Object.assign(r, patch);
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        hits = [...hits].sort(
          (a, b) => (Number(a[col]) - Number(b[col])) * (asc ? 1 : -1),
        );
      }
      if (limitN !== null) hits = hits.slice(0, limitN);
      return hits.map((r) =>
        projection
          ? Object.fromEntries(projection.map((c) => [c, r[c] ?? null]))
          : { ...r },
      );
    };

    const builder = {
      select(cols?: string) {
        if (cols && cols !== "*") projection = cols.split(",").map((c) => c.trim());
        return builder;
      },
      update(values: Row) {
        patch = values;
        return builder;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return builder;
      },
      is(col: string, v: unknown) {
        filters.push((r) => (r[col] ?? null) === v);
        return builder;
      },
      gte(col: string, v: number) {
        filters.push((r) => Number(r[col]) >= v);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderBy = { col, asc: opts?.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      maybeSingle() {
        const r = run();
        return Promise.resolve({ data: r[0] ?? null, error: null });
      },
      then<T>(
        resolve: (v: { data: Row[]; error: null }) => T,
        reject?: (e: unknown) => unknown,
      ) {
        try {
          return Promise.resolve(resolve({ data: run(), error: null }));
        } catch (e) {
          return reject
            ? Promise.resolve(reject(e))
            : Promise.reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
    };
    return builder;
  };
  return { from };
}
