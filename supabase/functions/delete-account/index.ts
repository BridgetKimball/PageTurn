// Supabase Edge Function: delete-account
//
// Deletes the calling user's auth account. All owned rows (profiles, shelves,
// user_books, shelf_books, reading_sessions, challenges, challenge_books) cascade-delete
// automatically via their `on delete cascade` foreign keys to auth.users(id) —
// see docs/DATABASE_SCHEMA.sql.
//
// Deploy with: supabase functions deploy delete-account
// See docs/DEPLOYMENT.md for the full walkthrough.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 })
  }

  // Verify the caller's JWT identifies a real, current user before doing anything destructive.
  const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await anonClient.auth.getUser()
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 })
  }

  // Use the service role only to perform the actual deletion, scoped to the verified caller.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
