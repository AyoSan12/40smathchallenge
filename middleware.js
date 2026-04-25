// middleware.js — Rate limiting + bot detection layer
// Berjalan di edge sebelum semua request ke /api/start dan /api/submit

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

// /api/start: 10x per 10 menit per IP
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

  // ── 2. Origin check — hanya izinkan dari domain kamu sendiri ────────────
  // GANTI 'https://your-app.vercel.app' dengan domain kamu yang sebenarnya!
  const ALLOWED_ORIGINS = [
    process.env.APP_ORIGIN,          // set di Vercel env: https://namaapp.vercel.app
    'http://localhost:3000',          // untuk development lokal
  ].filter(Boolean);

  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';

  const originAllowed = !origin || ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  const refererAllowed = !referer || ALLOWED_ORIGINS.some(o => referer.startsWith(o));

  if (!originAllowed && !refererAllowed) {
    console.warn(`[ORIGIN BLOCKED] origin=${origin} referer=${referer}`);
    return new Response('Akses tidak diizinkan.', { status: 403 });
  }

  // ── 3. Wajib ada Content-Type: application/json untuk POST ───────────────
  if (request.method === 'POST') {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return new Response('Content-Type harus application/json.', { status: 415 });
    }
  }

  // ── 4. Rate limiting per endpoint ────────────────────────────────────────
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
