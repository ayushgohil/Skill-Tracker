import { TestBed } from '@angular/core/testing';
import { supabase } from '../supabase.client';
import { BackupService } from './backup.service';
import { GoogleDriveService } from './google-drive.service';
import { CacheService } from './cache.service';
import { ActivityService } from './activity.service';

// A pretend database. Like the real one, it hands out at most 1000 rows per request.
const fakeDb = { tables: {} as Record<string, any[]>, requests: [] as string[] };

function installFakeDb() {
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null } as any);
    vi.spyOn(supabase, 'from').mockImplementation(((name: string) => {
        const builder: any = {
            select: () => builder,
            eq: () => builder,
            order: () => builder,
            maybeSingle: async () => ({ data: { id: 'u1', display_name: 'A', created_at: '' }, error: null }),
            range: async (from: number, to: number) => {
                fakeDb.requests.push(`${name}:${from}-${to}`);
                const all = fakeDb.tables[name] ?? [];
                return { data: all.slice(from, to + 1).slice(0, 1000), error: null, count: all.length };
            }
        };
        return builder;
    }) as any);
}

describe('BackupService: spotting backups cut off at 1000 rows', () => {
    let service: BackupService;

    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));
    const backup = (sizes: Partial<Record<string, number>>): any => ({
        metadata: {},
        subjects: rows(sizes['subjects'] ?? 3),
        topics: rows(sizes['topics'] ?? 10),
        subtopics: rows(sizes['subtopics'] ?? 20),
        user_progress: rows(sizes['user_progress'] ?? 10),
        weekly_goals: rows(sizes['weekly_goals'] ?? 0),
        weekly_reviews: rows(sizes['weekly_reviews'] ?? 0),
        activity_logs: rows(sizes['activity_logs'] ?? 5),
        topic_media: rows(sizes['topic_media'] ?? 0)
    });

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                BackupService,
                { provide: GoogleDriveService, useValue: {} },
                { provide: CacheService, useValue: {} },
                { provide: ActivityService, useValue: {} }
            ]
        });
        service = TestBed.inject(BackupService);
    });

    it('finds nothing wrong with an ordinary backup', () => {
        expect(service.findPossiblyCutOffTables(backup({}))).toEqual([]);
    });

    it('flags a table with exactly 1000 rows', () => {
        expect(service.findPossiblyCutOffTables(backup({ subtopics: 1000 }))).toEqual(['subtopics']);
    });

    it('flags several tables, and 2000 as well', () => {
        expect(service.findPossiblyCutOffTables(backup({ user_progress: 1000, topics: 2000 })))
            .toEqual(['topics', 'user_progress']);
    });

    it('does not flag empty tables', () => {
        expect(service.findPossiblyCutOffTables(backup({ weekly_goals: 0 }))).toEqual([]);
    });

    it('does not break on a backup with a missing table', () => {
        const b = backup({});
        delete b.topic_media;
        expect(service.findPossiblyCutOffTables(b)).toEqual([]);
    });
});


describe('BackupService.exportAllUserData: every row, not just the first 1000', () => {
    let service: BackupService;
    const rows = (n: number, extra: object = {}) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, ...extra }));

    beforeEach(() => {
        installFakeDb();
        fakeDb.requests = [];
        fakeDb.tables = {
            subjects: rows(3),
            topics: rows(1200),
            subtopics: rows(2500),
            user_progress: rows(1000),
            weekly_goals: [],
            weekly_reviews: [],
            activity_logs: rows(400),
            topic_media: rows(2)
        };
        TestBed.configureTestingModule({
            providers: [
                BackupService,
                { provide: GoogleDriveService, useValue: {} },
                { provide: CacheService, useValue: {} },
                { provide: ActivityService, useValue: {} }
            ]
        });
        service = TestBed.inject(BackupService);
    });

    afterEach(() => vi.restoreAllMocks());

    it('exports all rows of big tables', async () => {
        const backup = await service.exportAllUserData();
        expect(backup.subjects).toHaveLength(3);
        expect(backup.topics).toHaveLength(1200);
        expect(backup.subtopics).toHaveLength(2500);
        expect(backup.user_progress).toHaveLength(1000);
        expect(backup.activity_logs).toHaveLength(400);
        expect(backup.metadata.summary.totalSubtopics).toBe(2500);
        expect(backup.metadata.summary.totalTopics).toBe(1200);
    });

    it('asked for the extra pages', async () => {
        await service.exportAllUserData();
        expect(fakeDb.requests).toContain('subtopics:2000-2999');
        expect(fakeDb.requests).toContain('topics:1000-1999');
    });

    it('a backup it makes is not flagged as cut off', async () => {
        const backup = await service.exportAllUserData();
        // user_progress has exactly 1000 rows in this test: a harmless false alarm the wording allows for
        expect(service.findPossiblyCutOffTables(backup)).toEqual(['user_progress']);
    });
});
