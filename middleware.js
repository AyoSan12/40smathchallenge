import { next } from '@vercel/edge';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Inisialisasi Redis menggunakan variabel lingkungan otomatis dari Vercel
const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, '600 s'),
});

export const config = {
  matcher: '/api/submit',
};

export default async function middleware(request) {
  // Gunakan header 'x-real-ip' atau 'x-forwarded-for' untuk deteksi IP di Vercel
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);

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