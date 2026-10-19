import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) => new Response(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /barber
Disallow: /perfil
Disallow: /login
Disallow: /api/

Sitemap: ${new URL('/sitemap-index.xml', site)}
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
