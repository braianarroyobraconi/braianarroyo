import { geolocation, next } from '@vercel/functions';

// Spanish lives at /, English at /en/. People are sent to the language of their country on their first
// visit (or to the one they picked with the ES/EN toggle, stored in the `lang` cookie).
// Crawlers are never redirected, so search and AI engines can index both versions.
const SPANISH = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GQ', 'GT',
  'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
]);
const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|slack|discord|gptbot|chatgpt|oai-searchbot|claude|anthropic|perplexity|google-extended|ccbot|bytespider|amazonbot|applebot|duckassist|cohere|mistral|youbot|lighthouse|headless/i;

export const config = { matcher: ['/', '/after-hours/:path*', '/projects/:path*', '/en', '/en/:path*'] };

export default function middleware(request) {
  if (BOT.test(request.headers.get('user-agent') || '')) return next();
  const url = new URL(request.url);
  const isEn = url.pathname === '/en' || url.pathname.startsWith('/en/');
  const chosen = ((request.headers.get('cookie') || '').match(/(?:^|;\s*)lang=(es|en)/) || [])[1];
  const { country } = geolocation(request);
  const want = chosen || (country ? (SPANISH.has(country) ? 'es' : 'en') : null);
  if (want === 'en' && !isEn) { url.pathname = '/en' + url.pathname; return Response.redirect(url, 307); }
  // only leave /en/ when the visitor explicitly chose Spanish: shared English links stay English
  if (want === 'es' && isEn && chosen === 'es') { url.pathname = url.pathname.replace(/^\/en(\/|$)/, '/'); return Response.redirect(url, 307); }
  return next();
}
