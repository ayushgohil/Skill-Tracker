import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Auth-protected routes must be client-rendered (SSR has no access to
  // browser localStorage / URL hash fragments where Supabase stores tokens)
  {
    path: 'dashboard',
    renderMode: RenderMode.Client
  },
  {
    path: 'subjects/:id',
    renderMode: RenderMode.Client
  },
  {
    path: 'weekly',
    renderMode: RenderMode.Client
  },
  {
    path: 'profile',
    renderMode: RenderMode.Client
  },
  {
    path: 'auth/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'reset-password',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
