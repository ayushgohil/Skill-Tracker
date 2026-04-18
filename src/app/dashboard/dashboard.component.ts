// src/app/dashboard/dashboard.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { TopicsService, TopicWithProgress } from '../core/services/topics.service';
import { AuthService } from '../core/services/auth.service';
//import { TopicItemComponent, TopicChangeEvent } from './topic-item/topic-item.component';
import { TopicItemComponent, TopicChangeEvent } from './topic-item/topic-item.component';
import { AddTopicModalComponent, NewTopicData } from './add-topic-modal/add-topic-modal.component';
import { Router } from '@angular/router';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [TopicItemComponent, AddTopicModalComponent],
    template: `
    <div class="min-h-screen bg-zinc-950 text-white">

      <!-- Header -->
      <header class="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/90 backdrop-blur z-10">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <span class="text-zinc-950 font-black text-sm">S</span>
          </div>
          <span class="font-bold text-lg tracking-tight">SkillTracker</span>
        </div>

        <div class="flex items-center gap-4">
          <span class="text-zinc-500 text-sm hidden sm:block">{{ userEmail() }}</span>
          <button
            (click)="signOut()"
            class="text-zinc-500 hover:text-white text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main class="max-w-3xl mx-auto px-4 py-8">

        <!-- Overall Progress -->
        <div class="mb-8">
          <div class="flex items-center justify-between mb-2">
            <h1 class="text-xl font-semibold">My Learning Progress</h1>
            <span class="text-emerald-400 text-sm font-medium">
              {{ totalCompleted() }} / {{ topics().length }} done
            </span>
          </div>
          <div class="w-full bg-zinc-800 rounded-full h-2">
            <div
              class="bg-emerald-500 h-2 rounded-full transition-all duration-500"
              [style.width.%]="overallPercent()"
            ></div>
          </div>
        </div>

        @if (loading()) {
          <div class="text-center py-16 text-zinc-600">Loading topics...</div>
        } @else {

          <!-- Category Sections -->
          @for (category of categories; track category) {
            <section class="mb-8">

              <!-- Category Header -->
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                  <h2 class="font-semibold text-base">{{ category }}</h2>
                  <span class="text-zinc-500 text-sm">
                    {{ getCategoryCompleted(category) }}/{{ getCategoryTopics(category).length }}
                  </span>
                </div>
                <!-- Category progress -->
                <div class="flex items-center gap-2">
                  <div class="w-24 bg-zinc-800 rounded-full h-1.5">
                    <div
                      class="h-1.5 rounded-full transition-all duration-500"
                      [class.bg-emerald-500]="category === 'Angular'"
                      [class.bg-blue-500]="category === 'Backend'"
                      [style.width.%]="getCategoryPercent(category)"
                    ></div>
                  </div>
                  <span class="text-zinc-500 text-xs">{{ getCategoryPercent(category) }}%</span>
                </div>
              </div>

              <!-- Topics List -->
              <div class="space-y-2">
                @for (topic of getCategoryTopics(category); track topic.id) {
                  <app-topic-item
                    [topic]="topic"
                    (topicChanged)="onTopicChanged($event)"
                  />
                }
              </div>
            </section>
          }

          <!-- Add Topic Button -->
          <button
            (click)="showModal.set(true)"
            class="w-full border border-dashed border-zinc-700 hover:border-emerald-500 text-zinc-500 hover:text-emerald-400 rounded-xl py-4 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add new topic
          </button>
        }
      </main>
    </div>

    <!-- Add Topic Modal -->
    @if (showModal()) {
      <app-add-topic-modal
        (add)="addTopic($event)"
        (cancel)="showModal.set(false)"
      />
    }
  `
})
export class DashboardComponent implements OnInit {
    topics = signal<TopicWithProgress[]>([]);
    loading = signal(true);
    showModal = signal(false);
    categories = ['Angular', 'Backend'];

    totalCompleted = computed(() => this.topics().filter(t => t.completed).length);
    overallPercent = computed(() =>
        this.topics().length ? Math.round((this.totalCompleted() / this.topics().length) * 100) : 0
    );

    userEmail = computed(() => this.auth.currentUser()?.email ?? '');

    constructor(
        private topicsService: TopicsService,
        private auth: AuthService,
        private router: Router
    ) { }

    async ngOnInit() {
        await this.loadTopics();
    }

    async loadTopics() {
        this.loading.set(true);
        try {
            const data = await this.topicsService.getTopicsWithProgress();
            this.topics.set(data);
        } finally {
            this.loading.set(false);
        }
    }

    getCategoryTopics(category: string): TopicWithProgress[] {
        return this.topics().filter(t => t.category === category);
    }

    getCategoryCompleted(category: string): number {
        return this.getCategoryTopics(category).filter(t => t.completed).length;
    }

    getCategoryPercent(category: string): number {
        const catTopics = this.getCategoryTopics(category);
        if (!catTopics.length) return 0;
        return Math.round((this.getCategoryCompleted(category) / catTopics.length) * 100);
    }

    async onTopicChanged(event: TopicChangeEvent) {
        // Optimistic update
        this.topics.update(topics =>
            topics.map(t =>
                t.id === event.topicId
                    ? { ...t, completed: event.completed, notes: event.notes }
                    : t
            )
        );
        // Persist to Supabase
        await this.topicsService.upsertUserTopic(event.topicId, event.completed, event.notes);
    }

    async addTopic(data: NewTopicData) {
        this.showModal.set(false);
        await this.topicsService.addTopic(data.title, data.category, data.depth);
        await this.loadTopics();
    }

    async signOut() {
        await this.auth.signOut();
        this.router.navigate(['/auth/login']);
    }
}