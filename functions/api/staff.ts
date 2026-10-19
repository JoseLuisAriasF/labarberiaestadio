import { admin, emailStaff, json, mismoOrigen, USUARIO, type Env } from '../../server/lib';

// Acciones del dueño que tocan cuentas de Auth. Se identifica con su JWT
// (Authorization: Bearer) y se comprueba en la BD que es dueño de ESA barbería.
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido' }, 403);
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sin sesión' }, 401);
  const sb = admin(env);
  const { data: yo } = await sb.auth.getUser(token);
  if (!yo.user) return json({ error: 'Sesión inválida' }, 401);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { data: b } = await sb.from('barberias').select('id, codigo').eq('id', String(body.barberia_id ?? '')).eq('owner_id', yo.user.id).maybeSingle();
  if (!b) return json({ error: 'No eres dueño de esta barbería' }, 403);

  const barbero = async () => {
    const { data } = await sb.from('barberos').select('id, usuario_id').eq('id', String(body.barbero_id ?? '')).eq('barberia_id', b.id).maybeSingle();
    return data;
  };
  const clave = String(body.clave ?? '');
  const claveOk = clave.length >= 8 && /\d/.test(clave) && /[a-zA-Z]/.test(clave);

  switch (body.accion) {
    case 'crear': {
      const usuario = String(body.usuario ?? '').trim().toLowerCase();
      const nombre = String(body.nombre ?? '').trim().slice(0, 60);
      if (!USUARIO.test(usuario)) return json({ error: 'Usuario: 3 a 24 letras minúsculas, números o _' }, 400);
      if (nombre.length < 2) return json({ error: 'Nombre muy corto' }, 400);
      if (!claveOk) return json({ error: 'Clave temporal: 8+ caracteres con letras y números' }, 400);
      const { data: u, error } = await sb.auth.admin.createUser({
        email: emailStaff(b.codigo, usuario), password: clave, email_confirm: true,
        app_metadata: { rol: 'barbero', barberia_id: b.id },
      });
      if (error || !u.user) return json({ error: error?.message?.includes('already') ? 'Ese usuario ya existe' : 'No se pudo crear la cuenta' }, 400);
      const { data: nuevo, error: e2 } = await sb.from('barberos')
        .insert({ usuario_id: u.user.id, barberia_id: b.id, usuario, nombre, debe_cambiar_clave: true }).select('*').single();
      if (e2) { await sb.auth.admin.deleteUser(u.user.id); return json({ error: 'No se pudo registrar el barbero' }, 400); }
      return json({ barbero: nuevo });
    }
    case 'clave': {
      const br = await barbero();
      if (!br?.usuario_id) return json({ error: 'Barbero no encontrado' }, 404);
      if (!claveOk) return json({ error: 'Clave temporal: 8+ caracteres con letras y números' }, 400);
      await sb.auth.admin.updateUserById(br.usuario_id, { password: clave });
      await sb.from('barberos').update({ debe_cambiar_clave: true }).eq('id', br.id);
      return json({ ok: true });
    }
    case 'activo': {
      // Dar de baja también bloquea el login (ban), no solo lo oculta.
      const br = await barbero();
      if (!br?.usuario_id) return json({ error: 'Barbero no encontrado' }, 404);
      const activo = body.activo === true;
      await sb.auth.admin.updateUserById(br.usuario_id, { ban_duration: activo ? 'none' : '876000h' });
      await sb.from('barberos').update({ activo, estado: 'LIBRE' }).eq('id', br.id);
      return json({ ok: true });
    }
    case 'publicar': {
      // Regenera el sitio estático para que Google vea dirección/horario nuevos.
      if (!env.DEPLOY_HOOK_URL) return json({ error: 'Deploy hook no configurado' }, 400);
      const r = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
      return json({ ok: r.ok });
    }
  }
  return json({ error: 'Acción desconocida' }, 400);
};
