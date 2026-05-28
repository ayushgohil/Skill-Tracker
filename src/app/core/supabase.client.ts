// src/app/core/supabase.client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

// Standard fallback check for URL validity to prevent boot crashes in development when env variables are not configured
const isValidUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

const supabaseUrl = isValidUrl(environment.supabaseUrl)
    ? environment.supabaseUrl
    : 'https://placeholder-project.supabase.co';

const supabaseKey = environment.supabaseKey && environment.supabaseKey !== 'undefined'
    ? environment.supabaseKey
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-supabase-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);