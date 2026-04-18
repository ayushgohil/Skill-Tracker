// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
    },
    {
        path: 'auth',
        loadChildren: () =>
            import('./auth/auth.routes').then(m => m.AUTH_ROUTES)
    },
    {
        path: 'dashboard',
        canActivate: [authGuard],
        loadChildren: () =>
            import('./dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
    },
    {
        path: '**',
        redirectTo: 'dashboard'
    }
];