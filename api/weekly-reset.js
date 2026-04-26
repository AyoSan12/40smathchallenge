// api/weekly-reset.js — Vercel Cron Job untuk weekly leaderboard reset
// Schedule: setiap Senin jam 00:00 UTC (lihat vercel.json)
// Endpoint ini hanya bisa dipanggil oleh Vercel Cron (ada Authorization header khusus)

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // ── Security: hanya Vercel Cron yang boleh panggil endpoint ini ──────────
  const authHeader = req.headers.get('authorization');
  const CRON_SECRET = (typeof process !== 'undefined' && process.env?.CRON_SECRET)
    || globalThis.__env__?.CRON_SECRET;

  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.SUPABASE_URL)
    || globalThis.__env__?.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = (typeof process !== 'undefined' && process.env?.SUPABASE_SERVICE_KEY)
    || globalThis.__env__?.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });
  }

  try {
    // Increment CURRENT_SEASON di Supabase — pakai RPC atau update config table
    // Opsi A: Pakai Supabase RPC increment_season (buat function ini di Supabase)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_season`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Season increment failed:', errText);
      return new Response(JSON.stringify({ error: 'DB error', detail: errText }), { status: 500 });
    }

    const result = await res.json();
    console.log(`[WEEKLY RESET] Season incremented. New season: ${result?.new_season}`);

    return new Response(JSON.stringify({
      ok: true,
      message: `Season reset OK. New season: ${result?.new_season}`,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Weekly reset error:', e);
    return new Response(JSON.stringify({ error: 'Network error', detail: e.message }), { status: 500 });
  }
}
