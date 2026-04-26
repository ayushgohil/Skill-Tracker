// src/app/weekly/weekly.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { WeeklyService } from '../core/services/weekly.service';
import { TopicsService } from '../core/services/topics.service';
import { ToastService } from '../core/services/toast.service';
import { TopicWithProgress, StarredTopic, Subject, Depth } from '../core/models';
import { ToastComponent } from '../shared/toast/toast.component';

@Component({
    selector: 'app-weekly',
    standalone: true,
    imports: [ToastComponent, FormsModule],
    templateUrl: './weekly.component.html'
})
export class WeeklyComponent implements OnInit {

    // ── State ──────────────────────────────────────────
    step = signal<1 | 2 | 3>(1);
    loading = signal(true);
    saving = signal(false);

    completedThisWeek = signal<TopicWithProgress[]>([]);
    weakestSubject = signal<Subject | null>(null);
    allIncompleteTopics = signal<StarredTopic[]>([]);
    selectedTopicIds = signal<Set<string>>(new Set());

    MAX_STARS = 3;

    readonly depthConfig: Record<Depth, { label: string; classes: string }> = {
        shallow: { label: 'Shallow', classes: 'bg-zinc-800 text-zinc-400' },
        medium: { label: 'Medium', classes: 'bg-amber-500/20 text-amber-400' },
        deep: { label: 'Deep', classes: 'bg-red-500/20 text-red-400' }
    };

    // ── Computed ───────────────────────────────────────
    selectedCount = computed(() => this.selectedTopicIds().size);
    canSubmit = computed(() => this.selectedTopicIds().size > 0);

    // Group incomplete topics by subject for step 2
    groupedTopics = computed(() => {
        const topics = this.allIncompleteTopics();
        const groups: { name: string; color: string; topics: StarredTopic[] }[] = [];
        const map = new Map<string, StarredTopic[]>();

        for (const t of topics) {
            const key = t.subject_name;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(t);
        }

        for (const [name, items] of map) {
            groups.push({
                name,
                color: items[0].subject_color,
                topics: items
            });
        }

        return groups;
    });

    // Selected topic details for step 3
    selectedTopicDetails = computed(() => {
        const ids = this.selectedTopicIds();
        return this.allIncompleteTopics().filter(t => ids.has(t.id));
    });

    constructor(
        private weeklyService: WeeklyService,
        private topicsService: TopicsService,
        private toast: ToastService,
        private router: Router
    ) { }

    async ngOnInit() {
        try {
            const [completed, incomplete, subjectsWithTopics] = await Promise.all([
                this.weeklyService.getCompletedThisWeek(),
                this.weeklyService.getIncompleteTopicsAllSubjects(),
                this.topicsService.getSubjectsWithTopics()
            ]);

            this.completedThisWeek.set(completed);
            this.allIncompleteTopics.set(incomplete);
            this.weakestSubject.set(this.weeklyService.getWeakestSubject(subjectsWithTopics));

            // Pre-select already-starred topics
            const preSelected = new Set<string>();
            for (const t of incomplete) {
                if (t.starred) preSelected.add(t.id);
            }
            this.selectedTopicIds.set(preSelected);
        } catch {
            this.toast.error('Failed to load weekly review data.');
        } finally {
            this.loading.set(false);
        }
    }

    // ── Actions ───────────────────────────────────────
    toggleTopic(topicId: string) {
        this.selectedTopicIds.update(ids => {
            const next = new Set(ids);
            if (next.has(topicId)) {
                next.delete(topicId);
            } else if (next.size < this.MAX_STARS) {
                next.add(topicId);
            } else {
                this.toast.info('You can only focus on 3 topics per week.');
                return ids; // return same reference — no change
            }
            return next;
        });
    }

    isSelected(topicId: string): boolean {
        return this.selectedTopicIds().has(topicId);
    }

    async submitReview() {
        this.saving.set(true);
        try {
            await this.weeklyService.saveWeeklyReview([...this.selectedTopicIds()]);
            this.step.set(3);
            this.toast.success('Weekly review saved!');
        } catch {
            this.toast.error('Failed to save review.');
        } finally {
            this.saving.set(false);
        }
    }

    goToDashboard() {
        this.router.navigate(['/dashboard']);
    }

    skipReview() {
        this.router.navigate(['/dashboard']);
    }
}
