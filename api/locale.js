export const config = { runtime: 'edge' };
const M = { ID: 'id', JP: 'ja', KR: 'ko' };
export default function handler(request) {
  const country = (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
  const accept = (request.headers.get('accept-language') || '').toLowerCase();
  let language = M[country] || '';
  if (!language) language = accept.startsWith('id') ? 'id' : accept.startsWith('ja') ? 'ja' : accept.startsWith('ko') ? 'ko' : 'en';
  return new Response(JSON.stringify({ country: country || null, language }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
