import "server-only";

// Supabase/PostgREST caps a single response at 1000 rows by default, and
// silently truncates past that — no error. Catalog-wide reads (every test,
// every alias) are already near or past that, so they page through here.
const PAGE_SIZE = 1000;

interface PageResult<Row> {
  data: Row[] | null;
  error: unknown;
}

/**
 * Runs `query(from, to)` page by page until a short page comes back, and
 * returns every row. `query` must apply a stable `.order()` so pages don't
 * overlap or skip rows.
 */
export async function fetchAllRows<Row>(
  query: (from: number, to: number) => PromiseLike<PageResult<Row>>
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
