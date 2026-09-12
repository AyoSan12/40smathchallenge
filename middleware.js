import { next } from '@vercel/edge';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// /api/submit: 5x per 10 menit per IP
const submitLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '600 s'),
  prefix: 'rl:submit',
});

// /api/start: 10x per 10 menit per IP (lebih longgar, tapi tetap dibatasi)
const startLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '600 s'),
  prefix: 'rl:start',
});

export const config = {
  matcher: ['/api/submit', '/api/start'],
};

// User-Agent yang jelas-jelas bot/script
const BOT_UA_PATTERNS = [
  'curl', 'python', 'wget', 'axios', 'httpie', 'go-http',
  'java/', 'ruby', 'php/', 'perl/', 'libwww', 'scrapy',
  'postman', 'insomnia', 'okhttp',
];

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // ── 0. Security headers on every API response ────────────────────────────
  const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-XSS-Protection': '0',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  // ── 0b. Body size limit — reject oversized payloads (compressed is ~10KB) ─
  if (request.method === 'POST') {
    const cl = parseInt(request.headers.get('content-length') || '0', 10);
    if (cl > 60_000) {
      return new Response('Payload terlalu besar.', {
        status: 413,
        headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' },
      });
    }
  }

  // ── 1. Blokir User-Agent bot yang jelas ──────────────────────────────────
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  const isBot = BOT_UA_PATTERNS.some(p => ua.includes(p));
  if (isBot) {
    return new Response('Bot tidak diizinkan.', {
      status: 403,
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' },
    });
  }

  // ── 2. Wajib ada Content-Type: application/json untuk POST ───────────────
  if (request.method === 'POST') {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return new Response('Content-Type harus application/json.', {
        status: 415,
        headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' },
      });
    }
  }

  // ── 3. Rate limiting per endpoint ────────────────────────────────────────
  const ip = request.headers.get('x-real-ip')
    || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '127.0.0.1';

  const limiter = path === '/api/start' ? startLimiter : submitLimiter;
  const { success, limit, reset, remaining } = await limiter.limit(ip);

  if (!success) {
    return new Response('Terlalu banyak mencoba! Tunggu 10 menit lagi ya.', {
      status: 429,
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/plain',
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    });
  }

  const res = next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    try { res.headers.set(k, v); } catch {}
  }
  return res;
}
