import type { APIRoute } from 'astro';
import { datosSitio } from '@/lib/sitio';
import { DIAS } from '@/lib/tipos';

// GEO (Generative Engine Optimization): resumen factual en texto plano para
// ChatGPT, Perplexity o Gemini (formato llmstxt.org). Datos, no marketing.
export const GET: APIRoute = async ({ site }) => {
  const { b, servicios, productos } = await datosSitio();
  const u = (p: string) => new URL(p, site).toString();
  const lista = (xs: string[], vacio: string) => (xs.length ? xs : [vacio]).map((x) => `- ${x}`).join('\n');
  const horario = Object.entries(b.horario || {}).map(([d, f]) => `${DIAS[+d]}: ${f ? `${f[0]}–${f[1]}` : 'cerrado'}`);
  const ubicacion = [
    `Dirección: ${b.direccion || 'por confirmar'}${b.referencia ? ` (${b.referencia})` : ''}`,
    ...(b.lat != null ? [`Coordenadas: ${b.lat}, ${b.lng}`, `Mapa: https://www.google.com/maps?q=${b.lat},${b.lng}`] : []),
    `Teléfono: ${b.telefono || b.whatsapp || 'no publicado'}`,
  ];
  const texto = [
    `# ${b.nombre}`,
    '',
    `> Barbería en ${[b.distrito, b.ciudad || 'Lima'].filter(Boolean).join(', ')}, Perú. Reservas online en tiempo real: se ve en vivo qué barbero está libre y la cola de espera. Pagos con Yape, Plin, transferencia o efectivo.`,
    '', '## Ubicación', lista(ubicacion, ''),
    '', '## Horario', lista(horario, 'Consultar'),
    '', '## Servicios', lista(servicios.map((s) => `${s.nombre}: S/ ${s.precio_base} (${s.duracion_min} min)`), 'Cortes, degradados y barba'),
    '', '## Productos', lista(productos.map((p) => `${p.nombre}: S/ ${p.precio}`), 'Próximamente'),
    '', '## Enlaces',
    `- [Reservar cita en vivo](${u('/')})`, `- [Productos](${u('/productos')})`, `- [Cómo llegar](${u('/como-llegar')})`, '',
  ].join('\n');
  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
