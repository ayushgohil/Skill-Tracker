// src/app/core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { supabase } from '../supabase.client';

export const authGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    // Use getUser instead of getSession to prevent race conditions on refresh
    const { data } = await supabase.auth.getUser();

    if (data.user) {
        auth.currentUser.set(data.user);
        return true;
    }

    return router.createUrlTree(['/auth/login']);
};