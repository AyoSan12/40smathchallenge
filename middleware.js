import { next } from '@vercel/edge';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Inisialisasi Rate Limit menggunakan Environment Variables dari Vercel
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '600 s'), // 5 kali submit per 10 menit
  analytics: true,
});

export const config = {
  matcher: '/api/submit', // Hanya membatasi endpoint submit skor
};

export default async function middleware(request) {
  // Ambil IP address user
  const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return new Response('Terlalu banyak mencoba! Tunggu 10 menit lagi ya.', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    });
  }

  return next();
}