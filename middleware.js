import { geolocation, next } from '@vercel/functions';

// Spanish-speaking countries get the site in Spanish; everyone else in English.
// index.html reads this cookie; a language picked with the ES/EN toggle always wins.
const SPANISH = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GQ', 'GT',
  'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
]);

export const config = { matcher: ['/', '/projects/:path*'] };

export default function middleware(request) {
  const { country } = geolocation(request);
  if (!country) return next();
  const lang = SPANISH.has(country) ? 'es' : 'en';
  return next({
    headers: { 'set-cookie': `geo-lang=${lang}; Path=/; Max-Age=86400; SameSite=Lax; Secure` },
  });
}
