// src/app/landing/landing.component.ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-landing',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './landing.component.html'
})
export class LandingComponent {
    // Clean preview cells for the live hero interface mockup
    readonly previewCells: string[] = [
        'heat-0', 'heat-1', 'heat-2', 'heat-0',
        'heat-2', 'heat-3', 'heat-4', 'heat-2',
        'heat-1', 'heat-0', 'heat-2', 'heat-3',
        'heat-3', 'heat-2', 'heat-4', 'heat-1',
        'heat-0', 'heat-1', 'heat-3', 'heat-2',
        'heat-2', 'heat-4', 'heat-3', 'heat-0',
        'heat-1', 'heat-2', 'heat-1', 'heat-2',
        'heat-3', 'heat-4', 'heat-4', 'heat-3',
        'heat-2', 'heat-3', 'heat-1', 'heat-0',
        'heat-1', 'heat-2', 'heat-3', 'heat-4',
        'heat-3', 'heat-4', 'heat-2', 'heat-1',
        'heat-2', 'heat-3', 'heat-4', 'heat-4',
        'heat-1', 'heat-2', 'heat-0', 'heat-1',
        'heat-3', 'heat-4', 'heat-3', 'heat-2',
        'heat-4', 'heat-3', 'heat-2', 'heat-4',
        'heat-2', 'heat-1', 'heat-3', 'heat-3',
    ];
}
