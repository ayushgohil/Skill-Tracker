// src/app/core/services/title.strategy.ts
import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
    constructor(private readonly title: Title) {
        super();
    }

    override updateTitle(routerState: RouterStateSnapshot): void {
        const title = this.buildTitle(routerState);
        if (title) {
            if (title === 'Home') {
                this.title.setTitle('Nextlyr Skill Tracker | High-Performance Learning Cockpit');
            } else {
                this.title.setTitle(`${title} | Nextlyr Skill Tracker`);
            }
        } else {
            this.title.setTitle('Nextlyr Skill Tracker');
        }
    }
}
