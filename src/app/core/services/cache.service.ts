import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CacheService {
  private cache = new Map<string, any>();
  public dbCallCount = 0;
  public cacheHitCount = 0;

  get(key: string): any {
    const value = this.cache.get(key);
    if (value) {
      this.cacheHitCount++;
      //console.log(`[Cache] Hit for key: ${key}. Total Cache Hits: ${this.cacheHitCount}`);
    }
    return value;
  }

  set(key: string, value: any): void {
    this.cache.set(key, value);
    //console.log(`[Cache] Set for key: ${key}`);
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
      // console.log(`[Cache] Cleared for key: ${key}`);
    } else {
      this.cache.clear();
      //console.log(`[Cache] Cleared all`);
    }
  }

  incrementDbCall(operation: string) {
    this.dbCallCount++;
    //console.log(`[Database] Call for operation: ${operation}. Total DB Calls: ${this.dbCallCount}`);
  }

  getStats() {
    return {
      dbCalls: this.dbCallCount,
      cacheHits: this.cacheHitCount
    };
  }
}
