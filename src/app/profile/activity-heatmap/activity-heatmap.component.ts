// src/app/profile/activity-heatmap/activity-heatmap.component.ts
import { Component, OnInit, signal, input, effect } from '@angular/core';
import { ActivityService, ActivityLog } from '../../core/services/activity.service';

interface HeatmapDay {
    date: Date | null;
    count: number;
    level: number; // 0-4 for colors
}

@Component({
    selector: 'app-activity-heatmap',
    standalone: true,
    templateUrl: './activity-heatmap.component.html'
})
export class ActivityHeatmapComponent implements OnInit {
    
    // Input from profile (the year the user created their account)
    joinYear = input<number>(new Date().getFullYear());

    days = signal<HeatmapDay[]>([]);
    loading = signal(true);
    currentStreak = signal(0);
    maxStreak = signal(0);
    totalCompletions = signal(0);

    selectedYear = signal<number>(new Date().getFullYear());
    availableYears = signal<number[]>([]);

    constructor(private activityService: ActivityService) {
        effect(() => {
            // This effect runs whenever joinYear changes
            this.updateAvailableYears(this.joinYear());
        });
    }

    ngOnInit() {
        // Load the initial selected year (current year) on mount
        this.loadYear(this.selectedYear());
    }

    private updateAvailableYears(startYear: number) {
        const currentYear = new Date().getFullYear();
        const start = startYear || currentYear;
        const years = [];
        for (let y = currentYear; y >= start; y--) {
            years.push(y);
        }
        this.availableYears.set(years);
    }

    async selectYear(year: number) {
        this.selectedYear.set(year);
        await this.loadYear(year);
    }

    private async loadYear(year: number) {
        this.loading.set(true);
        try {
            const logs = await this.activityService.getActivityLogsForYear(year);
            this.buildHeatmap(year, logs);
            this.calculateStreaks(logs);
        } catch (e) {
            console.error(e);
        } finally {
            this.loading.set(false);
        }
    }

    private buildHeatmap(year: number, logs: ActivityLog[]) {
        const logMap = new Map<string, number>();
        for (const log of logs) {
            const dateKey = log.date.split('T')[0];
            const existing = logMap.get(dateKey) || 0;
            logMap.set(dateKey, existing + log.tasks_completed);
        }

        const generatedDays: HeatmapDay[] = [];
        
        // Find Jan 1st of the selected year
        const startDate = new Date(year, 0, 1); // Jan 1
        
        // Find what day of the week Jan 1st is (0 = Sunday, 1 = Monday, etc.)
        const startDayOfWeek = startDate.getDay();
        
        // Prepend null days so Jan 1 starts on the correct row in CSS grid
        for (let i = 0; i < startDayOfWeek; i++) {
            generatedDays.push({ date: null, count: 0, level: -1 });
        }

        // Generate all days in the year
        const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
        const daysInYear = isLeapYear ? 366 : 365;

        for (let i = 0; i < daysInYear; i++) {
            const d = new Date(year, 0, 1 + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            
            const count = logMap.get(dateStr) ?? 0;
            
            generatedDays.push({
                date: d,
                count,
                level: this.getLevel(count)
            });
        }

        this.days.set(generatedDays);
    }

    private getLevel(count: number): number {
        if (count === 0) return 0;
        if (count <= 2) return 1;
        if (count <= 5) return 2;
        if (count <= 8) return 3;
        return 4;
    }

    private calculateStreaks(logs: ActivityLog[]) {
        let current = 0;
        let max = 0;
        let total = 0;
        
        const sortedLogs = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        
        const today = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];

        let streakActive = false;
        if (sortedLogs.length > 0 && (sortedLogs[0].date === today || sortedLogs[0].date === yesterday)) {
            streakActive = true;
        }

        let tempStreak = 0;
        let lastDate: Date | null = null;

        const ascLogs = [...sortedLogs].reverse();
        
        for (const log of ascLogs) {
            total += log.tasks_completed;
            const logDate = new Date(log.date);
            
            if (!lastDate) {
                tempStreak = 1;
            } else {
                const diffTime = Math.abs(logDate.getTime() - lastDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                if (diffDays === 1) {
                    tempStreak++;
                } else if (diffDays > 1) {
                    tempStreak = 1;
                }
            }
            lastDate = logDate;
            if (tempStreak > max) max = tempStreak;
        }

        if (streakActive && ascLogs.length > 0) {
            current = tempStreak;
        }

        this.currentStreak.set(current);
        this.maxStreak.set(max);
        this.totalCompletions.set(total);
    }
}
