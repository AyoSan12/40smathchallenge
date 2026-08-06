export const config = {
  runtime: 'edge',
};

// ── Helper: verifikasi Cloudflare Turnstile ──────────────────────────────────
async function verifyTurnstile(token, ip) {
  const TURNSTILE_SECRET = (typeof process !== 'undefined' && process.env?.TURNSTILE_SECRET_KEY)
    || globalThis.__env__?.TURNSTILE_SECRET_KEY;

  if (!TURNSTILE_SECRET) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping verification');
    return { success: true }; // graceful degradation kalau env belum diset
  }

  if (!token) return { success: false, reason: 'No turnstile token' };

  const formData = new FormData();
  formData.append('secret', TURNSTILE_SECRET);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return data;
  } catch (e) {
    console.error('Turnstile verify error:', e);
    return { success: false, reason: 'Verify request failed' };
  }
}

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://40smathchallenge.vercel.app',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const SECRET = (typeof process !== 'undefined' && process.env?.SESSION_SECRET)
    || globalThis.__env__?.SESSION_SECRET;

  if (!SECRET) {
    return new Response(JSON.stringify({ error: 'Server config error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Verifikasi Turnstile ──────────────────────────────────────────────────
  let body = {};
  try { body = await req.json(); } catch {}

  const clientIp = req.headers.get('x-real-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '127.0.0.1';

  const turnstileResult = await verifyTurnstile(body.turnstileToken, clientIp);
  if (!turnstileResult.success) {
    console.warn(`[TURNSTILE FAIL] IP=${clientIp} reason=${JSON.stringify(turnstileResult['error-codes'])}`);
    return new Response(JSON.stringify({ error: 'Verifikasi Cloudflare gagal. Refresh halaman dan coba lagi.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Generate HMAC session token ───────────────────────────────────────────
  // Token structure: timestamp.nonce.ipFingerprint.signature
  // ipFingerprint binds the token to the issuing IP so a token stolen/replayed
  // from another IP is rejected server-side (hardening adapted from best practice).
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const ipFingerprint = await hashIp(clientIp);
  const payload = `${timestamp}.${nonce}.${ipFingerprint}`;

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(payload));

  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const sessionToken = `${payload}.${signature}`;

  return new Response(JSON.stringify({ sessionToken }), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// Deterministic IP fingerprint (hex) so tokens are bound to the caller's IP.
async function hashIp(ip) {
  try {
    const data = new TextEncoder().encode(`ip:${ip}`);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch {
    return '0000000000000000';
  }
}
