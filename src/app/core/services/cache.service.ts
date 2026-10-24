import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CacheService {
  private cache = new Map<string, any>();
  private clearListeners: Array<() => void> = [];
  public dbCallCount = 0;
  public cacheHitCount = 0;

  get(key: string): any {
    const value = this.cache.get(key);
    if (value !== undefined && value !== null) {
      this.cacheHitCount++;
    }
    return value;
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  onClear(fn: () => void): void {
    this.clearListeners.push(fn);
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
      for (const fn of this.clearListeners) {
        try {
          fn();
        } catch (e) {
          console.error('Error in cache clear listener:', e);
        }
      }
    }
  }

  clearSubjects(): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith('subject') || key.startsWith('topics_for_subject')) {
        this.cache.delete(key);
      }
    }
  }

  clearWeekly(): void {
    this.cache.delete('weekly_starred_topics');
    this.cache.delete('weekly_review_due');
  }

  incrementDbCall(operation: string) {
    this.dbCallCount++;
  }

  getStats() {
    return {
      dbCalls: this.dbCallCount,
      cacheHits: this.cacheHitCount
    };
  }
}
