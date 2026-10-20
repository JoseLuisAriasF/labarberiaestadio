import { admin, json, mismoOrigen, type Env } from '../../server/lib';

// El admin/dueño o un barbero de la barbería puede reiniciar la clave de un cliente que la olvidó.
// Doble check: el caller es staff de alguna barbería donde ese cliente tiene cita.
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido' }, 403);
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (!token) return json({ error: 'No autenticado' }, 401);

  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const clienteId = String(body.cliente_id ?? '');
  const nuevaClave = String(body.clave ?? '');
  if (!/^[0-9a-f-]{36}$/.test(clienteId)) return json({ error: 'cliente inválido' }, 400);
  if (nuevaClave.length < 6) return json({ error: 'La clave necesita al menos 6 caracteres' }, 400);

  const sb = admin(env);
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return json({ error: 'Sesión inválida' }, 401);
  const callerId = who.user.id;

  // Caller es staff de alguna barbería; cliente target tiene cita en esa misma barbería.
  const { data: cliente } = await sb.from('clientes').select('id, usuario_id').eq('id', clienteId).maybeSingle();
  if (!cliente?.usuario_id) return json({ error: 'Ese cliente no tiene cuenta propia' }, 404);

  // Barberías donde el caller es dueño O barbero.
  const [barberiasPropias, barberoRow] = await Promise.all([
    sb.from('barberias').select('id').eq('owner_id', callerId),
    sb.from('barberos').select('barberia_id').eq('usuario_id', callerId).eq('activo', true).maybeSingle(),
  ]);
  const ids = [
    ...(barberiasPropias.data?.map((x) => x.id) ?? []),
    ...(barberoRow.data?.barberia_id ? [barberoRow.data.barberia_id] : []),
  ];
  if (ids.length === 0) return json({ error: 'Sin permiso: no eres staff de ninguna barbería' }, 403);
  const { count } = await sb.from('citas')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
    .in('barberia_id', ids);
  if (!count) return json({ error: 'Sin permiso: ese cliente no tiene citas en tu barbería' }, 403);

  const { error } = await sb.auth.admin.updateUserById(cliente.usuario_id, { password: nuevaClave });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true });
};
