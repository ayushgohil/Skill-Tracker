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
        // ── 1. Authenticate the caller ──────────────────────────
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'No authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Verify user identity with their JWT
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: userError } = await userClient.auth.getUser()
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── 2. Read the stored refresh token (service role) ─────
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        const { data: profile, error: profileError } = await adminClient
            .from('profiles')
            .select('google_refresh_token')
            .eq('id', user.id)
            .single()

        if (profileError || !profile?.google_refresh_token) {
            return new Response(
                JSON.stringify({ error: 'No refresh token stored. Please connect Google Drive first.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── 3. Exchange refresh token for a fresh access token ──
        // Google Client ID and Secret are stored as Supabase secrets
        // and NEVER exposed to the frontend.
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

        if (!clientId || !clientSecret) {
            console.error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured')
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: profile.google_refresh_token,
                grant_type: 'refresh_token',
            }),
        })

        const tokenData = await tokenRes.json()

        if (!tokenRes.ok || !tokenData.access_token) {
            console.error('Google token exchange failed:', tokenData)

            // If Google says the refresh token is invalid/revoked, clean it up
            if (tokenData.error === 'invalid_grant') {
                await adminClient
                    .from('profiles')
                    .update({ google_refresh_token: null })
                    .eq('id', user.id)

                return new Response(
                    JSON.stringify({
                        error: 'Google authorization has been revoked. Please reconnect Google Drive.',
                        code: 'REFRESH_TOKEN_REVOKED'
                    }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ error: 'Failed to refresh Google token' }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── 4. Return the fresh access token ────────────────────
        // Only return the access token and its expiry — never the refresh token.
        return new Response(
            JSON.stringify({
                access_token: tokenData.access_token,
                expires_in: tokenData.expires_in ?? 3600,
            }),
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
