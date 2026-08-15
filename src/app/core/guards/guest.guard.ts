// src/app/core/guards/guest.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { supabase } from '../supabase.client';

export const guestGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    // Use getSession for instant local session check from localStorage without network delay
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
        auth.currentUser.set(session.user);
        return router.createUrlTree(['/dashboard']);
    }

    return true;
};