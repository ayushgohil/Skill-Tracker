// src/app/core/supabase-paging.ts
// Supabase returns at most 1000 rows per request (the "max rows" API setting) and
// quietly drops the rest. Anything that must see EVERY row (backups, the dashboard
// totals) has to ask page by page. These helpers do that.
//
// Rules for the query you pass in:
//   - select with  { count: 'exact' }  so the total is known
//   - sort by something that is unique (add .order('id') last), otherwise rows can
//     repeat or be skipped between pages
//   - end with .range(from, to)

export const PAGE_SIZE = 1000;
/** Ids sent in one `.in(...)` filter. Long lists make the request URL too long to be accepted. */
export const ID_CHUNK_SIZE = 100;

export interface PageResult {
    data: any[] | null;
    error: any;
    count?: number | null;
}

/** Loads every row of a query, one page at a time. Throws if any page fails. */
export async function fetchAllRows<T = any>(
    page: (from: number, to: number) => PromiseLike<PageResult>,
    pageSize: number = PAGE_SIZE
): Promise<T[]> {
    const rows: T[] = [];
    let total: number | null = null;

    // The page limit only stops a runaway loop if the server misbehaves.
    for (let pages = 0; pages < 10_000; pages++) {
        const from = rows.length;
        const res = await page(from, from + pageSize - 1);
        if (res.error) throw res.error;

        const batch = (res.data ?? []) as T[];
        rows.push(...batch);
        if (typeof res.count === 'number') total = res.count;

        if (batch.length === 0) break;
        // Even if the server sends fewer rows than asked for (a lower max-rows setting),
        // keep going until the known total is reached.
        if (total !== null ? rows.length >= total : batch.length < pageSize) break;
    }
    return rows;
}

/** Same, for a filter on a long list of ids: the ids are sent in small groups. */
export async function fetchAllRowsForIds<T = any>(
    ids: string[],
    page: (idChunk: string[], from: number, to: number) => PromiseLike<PageResult>,
    chunkSize: number = ID_CHUNK_SIZE
): Promise<T[]> {
    const unique = Array.from(new Set(ids));
    const all: T[] = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        all.push(...await fetchAllRows<T>((from, to) => page(chunk, from, to)));
    }
    return all;
}
