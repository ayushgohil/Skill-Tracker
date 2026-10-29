import { TestBed } from '@angular/core/testing';
import { ActivityHeatmapComponent, describeDay, HEAT_LEGEND } from './activity-heatmap.component';
import { ActivityService } from '../../core/services/activity.service';

describe('describeDay', () => {
    it('says no tasks, one task, or several', () => {
        const d = new Date(2026, 9, 12); // 12 Oct 2026, a Monday
        expect(describeDay(d, 0)).toBe('Mon, 12 Oct 2026: no tasks completed');
        expect(describeDay(d, 1)).toBe('Mon, 12 Oct 2026: 1 task completed');
        expect(describeDay(d, 3)).toBe('Mon, 12 Oct 2026: 3 tasks completed');
    });
});

describe('ActivityHeatmapComponent: day hint and legend', () => {
    const logs = [
        { date: '2026-10-12', tasks_completed: 3 },
        { date: '2026-10-13', tasks_completed: 1 }
    ];

    const create = async () => {
        await TestBed.configureTestingModule({
            imports: [ActivityHeatmapComponent],
            providers: [{ provide: ActivityService, useValue: { getActivityLogsForYear: vi.fn().mockResolvedValue(logs) } }]
        }).compileComponents();
        const fixture = TestBed.createComponent(ActivityHeatmapComponent);
        fixture.componentRef.setInput('joinYear', 2026);
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
        return fixture;
    };

    it('shows a hint until a day is chosen', async () => {
        const fixture = await create();
        const el = fixture.nativeElement as HTMLElement;
        expect(el.textContent).toContain('Tap or hover over a day');
        expect(fixture.componentInstance.selectedDayText()).toBe('');
    });

    it('colours the days in the grid by how much was done (and the legend is separate)', async () => {
        const fixture = await create();
        const grid = (fixture.nativeElement as HTMLElement).querySelector('.grid')!;
        expect(grid.querySelectorAll('.heat-2')).toHaveLength(1); // 3 tasks
        expect(grid.querySelectorAll('.heat-1')).toHaveLength(1); // 1 task
        expect(grid.querySelectorAll('.heat-3, .heat-4')).toHaveLength(0);
    });

    it('describes the chosen day in words', async () => {
        const fixture = await create();
        const c = fixture.componentInstance;
        const day = c.days().find(d => d.date && d.date.getMonth() === 9 && d.date.getDate() === 12)!;
        c.selectDay(day);
        fixture.detectChanges();

        expect(c.selectedDayText()).toBe('Mon, 12 Oct 2026: 3 tasks completed');
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('Mon, 12 Oct 2026: 3 tasks completed');
    });

    it('ignores the empty padding cells before 1 January', async () => {
        const fixture = await create();
        const c = fixture.componentInstance;
        const padding = c.days().find(d => d.date === null);
        if (padding) {
            c.selectDay(padding);
            expect(c.selectedDay()).toBeNull();
        }
    });

    it('gives screen readers one sentence instead of 365 squares', async () => {
        const fixture = await create();
        const el = fixture.nativeElement as HTMLElement;
        expect(fixture.componentInstance.summary()).toContain('Activity for 2026: 4 tasks completed on 2 days.');
        expect(el.querySelector('.sr-only')?.textContent).toContain('4 tasks completed on 2 days');
        expect(el.querySelector('[aria-hidden="true"].grid')).not.toBeNull();
    });

    it('has a legend that explains every colour', () => {
        expect(HEAT_LEGEND.map(l => l.level)).toEqual([0, 1, 2, 3, 4]);
        expect(HEAT_LEGEND[1].label).toBe('1 to 2 tasks');
    });
});
