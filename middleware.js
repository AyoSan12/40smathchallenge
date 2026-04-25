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

  // ── 1. Blokir User-Agent bot yang jelas ──────────────────────────────────
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  const isBot = BOT_UA_PATTERNS.some(p => ua.includes(p));
  if (isBot) {
    return new Response('Bot tidak diizinkan.', { status: 403 });
  }

  // ── 2. Wajib ada Content-Type: application/json untuk POST ───────────────
  if (request.method === 'POST') {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return new Response('Content-Type harus application/json.', { status: 415 });
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
        'Content-Type': 'text/plain',
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    });
  }

  return next();
}
