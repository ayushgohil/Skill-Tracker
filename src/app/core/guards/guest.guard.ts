// src/app/core/guards/guest.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { supabase } from '../supabase.client';

export const guestGuard: CanActivateFn = async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const { data } = await supabase.auth.getSession();

    if (data.session) {
        auth.currentUser.set(data.session.user);
        return router.createUrlTree(['/dashboard']);
    }

    return true;
};