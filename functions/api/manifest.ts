import { admin, type Env } from '../../server/lib';

// Manifiesto de la app instalada, con el nombre y el logo de cada barbería.
// t=cliente → app del cliente · t=staff → app del personal (admin y barberos).
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const codigo = (url.searchParams.get('c') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const staff = url.searchParams.get('t') === 'staff';

  const { data: b } = await admin(env).from('barberias').select('nombre, logo_url').eq('codigo', codigo).maybeSingle();
  const nombre = (b?.nombre as string | undefined) ?? 'La Barbería';
  const logo = b?.logo_url as string | null | undefined;

  const icons = logo
    ? [
        { src: logo, sizes: '192x192', type: logo.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg', purpose: 'any' },
        { src: logo, sizes: '512x512', type: logo.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg', purpose: 'any' },
      ]
    : [
        { src: '/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ];

  const manifest = {
    name: staff ? `${nombre} · Personal` : nombre,
    short_name: staff ? 'Personal' : nombre.split(' ')[0].slice(0, 12),
    description: staff ? 'Panel del personal: jornada, citas y clientes.' : 'Reserva tu corte en tiempo real.',
    lang: 'es-PE',
    start_url: staff ? '/login?pwa=1' : '/?pwa=1',
    scope: '/',
    display: 'standalone',
    background_color: '#070707',
    theme_color: '#070707',
    icons,
  };

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};
