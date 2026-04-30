// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
export const routes: Routes = [
    {
        path: '',
        canActivate: [guestGuard],
        loadComponent: () => import('./landing/landing.component').then(m => m.LandingComponent)
    },
    // OAuth callback — must be BEFORE the guarded 'auth' route so guestGuard doesn't interfere
    {
        path: 'auth/callback',
        loadComponent: () => import('./auth/callback/callback.component').then(m => m.CallbackComponent)
    },
    {
        path: 'auth',
        canActivate: [guestGuard],
        loadChildren: () => import('./auth/auth.routes').then(m => m.AUTH_ROUTES)
    },
    {
        path: 'reset-password',
        loadComponent: () => import('./auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
    },
    {
        path: 'dashboard',
        canActivate: [authGuard],
        loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
    },
    {
        path: 'subjects/:id',
        canActivate: [authGuard],
        loadComponent: () => import('./subjects/subject-detail/subject-detail.component').then(m => m.SubjectDetailComponent)
    },
    {
        path: 'profile',
        canActivate: [authGuard],
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent)
    },
    {
        path: 'weekly',
        canActivate: [authGuard],
        loadComponent: () => import('./weekly/weekly.component').then(m => m.WeeklyComponent)
    },
    { path: '**', redirectTo: 'dashboard' }
];