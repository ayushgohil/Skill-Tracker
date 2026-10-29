import { fetchAllRows, fetchAllRowsForIds, PageResult } from './supabase-paging';

/** A pretend Supabase table that answers like the real thing, including its row limit. */
function fakeTable(total: number, maxRowsPerRequest = 1000) {
    const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
    const calls: [number, number][] = [];
    const page = async (from: number, to: number): Promise<PageResult> => {
        calls.push([from, to]);
        const wanted = rows.slice(from, to + 1);
        return { data: wanted.slice(0, maxRowsPerRequest), error: null, count: total };
    };
    return { page, calls };
}

describe('fetchAllRows', () => {
    it('returns everything when there are more rows than one request can carry', async () => {
        const t = fakeTable(2500);
        const rows = await fetchAllRows(t.page);
        expect(rows).toHaveLength(2500);
        expect(rows.map(r => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i + 1)); // none repeated or missing
        expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    });

    it('needs only one request for a small table', async () => {
        const t = fakeTable(37);
        expect(await fetchAllRows(t.page)).toHaveLength(37);
        expect(t.calls).toHaveLength(1);
    });

    it('works for an empty table', async () => {
        const t = fakeTable(0);
        expect(await fetchAllRows(t.page)).toEqual([]);
        expect(t.calls).toHaveLength(1);
    });

    it('does not ask for a page that does not exist when the total is an exact multiple', async () => {
        const t = fakeTable(2000);
        expect(await fetchAllRows(t.page)).toHaveLength(2000);
        expect(t.calls).toHaveLength(2);
    });

    it('still gets everything when the server limit is lower than the page size', async () => {
        const t = fakeTable(1300, 500); // server sends at most 500 rows per request
        const rows = await fetchAllRows(t.page);
        expect(rows).toHaveLength(1300);
        expect(new Set(rows.map(r => r.id)).size).toBe(1300);
    });

    it('falls back to short-page detection when no total is given', async () => {
        const data = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
        const page = async (from: number, to: number): Promise<PageResult> =>
            ({ data: data.slice(from, to + 1), error: null });
        expect(await fetchAllRows(page)).toHaveLength(1500);
    });

    it('stops with the error if any page fails, instead of returning part of the data', async () => {
        let n = 0;
        const page = async (from: number, to: number): Promise<PageResult> => {
            n++;
            if (n === 2) return { data: null, error: new Error('network down'), count: 3000 };
            return { data: Array.from({ length: to - from + 1 }, (_, i) => ({ id: from + i })), error: null, count: 3000 };
        };
        await expect(fetchAllRows(page)).rejects.toThrow('network down');
    });

    it('stops if the server returns nothing even though it promised more', async () => {
        const page = async (): Promise<PageResult> => ({ data: [], error: null, count: 50 });
        expect(await fetchAllRows(page)).toEqual([]);
    });
});

describe('fetchAllRowsForIds', () => {
    it('sends long id lists in small groups, never all at once', async () => {
        const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
        const seen: string[][] = [];
        const page = async (chunk: string[]): Promise<PageResult> => {
            seen.push(chunk);
            return { data: chunk.map(id => ({ id })), error: null, count: chunk.length };
        };
        const rows = await fetchAllRowsForIds(ids, page);
        expect(rows).toHaveLength(250);
        expect(seen.map(c => c.length)).toEqual([100, 100, 50]);
    });

    it('ignores repeated ids and makes no request for an empty list', async () => {
        const page = vi.fn(async (chunk: string[]): Promise<PageResult> =>
            ({ data: chunk.map(id => ({ id })), error: null, count: chunk.length }));
        expect(await fetchAllRowsForIds(['a', 'a', 'b'], page)).toHaveLength(2);
        page.mockClear();
        expect(await fetchAllRowsForIds([], page)).toEqual([]);
        expect(page).not.toHaveBeenCalled();
    });

    it('pages inside each group too', async () => {
        const ids = ['a', 'b'];
        const t = fakeTable(1200);
        const rows = await fetchAllRowsForIds(ids, (_chunk, from, to) => t.page(from, to));
        expect(rows).toHaveLength(1200);
    });
});
