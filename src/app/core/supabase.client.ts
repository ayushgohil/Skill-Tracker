// src/app/core/supabase.client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const supabase: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseKey
);