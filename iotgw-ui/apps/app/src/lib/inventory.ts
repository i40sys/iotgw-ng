/** Search every term across visible inventory fields, including full IDs. */
export function matchesInventorySearch(
  query: string,
  ...fields: (string | null | undefined)[]
): boolean {
  const text = fields.filter(Boolean).join(" ").toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .every((term) => text.includes(term));
}
