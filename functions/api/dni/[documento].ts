import { admin, json, mismoOrigen, type Env } from '../../../server/lib';

const BASE = 'http://cliente.linktek-online.com:9284/api/cliente/';

// Solo personal de barbería: el navegador de un cliente nunca consulta la búsqueda.
export const onRequestGet = async ({ request, env, params }: { request: Request; env: Env; params: { documento: string } }) => {
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido' }, 403);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sin sesión' }, 401);

  const sb = admin(env);
  const { data: yo } = await sb.auth.getUser(token);
  if (!yo.user) return json({ error: 'Sesión inválida' }, 401);
  const { data: staff } = await sb.from('barberos').select('id').eq('usuario_id', yo.user.id).eq('activo', true).maybeSingle();
  const { data: dueno } = await sb.from('barberias').select('id').eq('owner_id', yo.user.id).maybeSingle();
  if (!staff && !dueno) return json({ error: 'Solo personal de la barbería' }, 403);

  const documento = String(params.documento ?? '').trim();
  if (!/^\d{8}$/.test(documento)) return json({ error: 'El DNI tiene 8 dígitos' }, 400);

  const r = await fetch(BASE + documento, { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!r || r.status === 404) return json({ encontrado: false });
  if (!r.ok) return json({ error: 'El servicio de búsqueda no responde. Registra los datos a mano.' }, 502);

  const j = (await r.json().catch(() => null)) as { success?: boolean; result?: Record<string, unknown> } | null;
  const d = j?.success && j.result ? j.result : null;
  if (!d) return json({ encontrado: false });
  const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const nombres = txt(d.nombres);
  const apellidos = [txt(d.apellido_paterno), txt(d.apellido_materno)].filter(Boolean).join(' ');
  return json({ encontrado: !!(nombres || apellidos), nombres, apellidos });
};
