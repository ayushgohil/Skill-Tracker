import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Get the user's JWT from the request header
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'No authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Create a client with the user's token to verify identity
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        // 3. Verify the user is authenticated
        const { data: { user }, error: userError } = await userClient.auth.getUser()
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const userId = user.id

        // 4. Create admin client with service role key for deletion
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // 5. Delete in order (respecting FK constraints)
        const deletions = [
            { table: 'activity_logs', column: 'user_id' },
            { table: 'weekly_reviews', column: 'user_id' },
            { table: 'weekly_goals', column: 'user_id' },
            { table: 'user_progress', column: 'user_id' },
            { table: 'subtopics', column: 'user_id' },
            { table: 'topics', column: 'user_id' },
            { table: 'subjects', column: 'user_id' },
            { table: 'profiles', column: 'id' },
        ]

        for (const { table, column } of deletions) {
            const { error } = await adminClient
                .from(table)
                .delete()
                .eq(column, userId)

            // activity_logs may not exist — ignore that error only
            if (error && table !== 'activity_logs') {
                console.error(`Error deleting ${table}:`, error)
                return new Response(
                    JSON.stringify({ error: `Failed to delete ${table}` }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // 6. Delete the auth user — requires service role
        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
        if (deleteAuthError) {
            console.error('Error deleting auth user:', deleteAuthError)
            return new Response(
                JSON.stringify({ error: 'Failed to delete auth account' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        console.error('Unexpected error:', err)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})