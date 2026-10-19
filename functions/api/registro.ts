import { admin, emailStaff, json, mismoOrigen, turnstileOk, USUARIO, type Env } from '../../server/lib';

// Alta de una barbería (tenant): código B{n} automático, 90 días de prueba y la
// cuenta master del dueño. Todo o nada: si algo falla se deshace lo creado.
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido' }, 403);
  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const nombre = String(body.nombre ?? '').trim();
  const usuario = String(body.usuario ?? '').trim().toLowerCase();
  const clave = String(body.clave ?? '');
  const email = String(body.email ?? '').trim().toLowerCase();
  const telefono = String(body.telefono ?? '').trim();

  if (nombre.length < 2 || nombre.length > 80) return json({ error: 'Nombre de barbería inválido' }, 400);
  if (!USUARIO.test(usuario)) return json({ error: 'Usuario: 3 a 24 letras minúsculas, números o _' }, 400);
  if (clave.length < 10 || !/\d/.test(clave) || !/[a-zA-Z]/.test(clave)) return json({ error: 'La clave necesita 10+ caracteres con letras y números' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Correo inválido' }, 400);
  if (!(await turnstileOk(env, body.turnstile, request.headers.get('CF-Connecting-IP')))) return json({ error: 'Verificación anti-bots fallida' }, 400);

  const sb = admin(env);
  const { data: b, error: e1 } = await sb.from('barberias')
    .insert({ nombre, email_contacto: email, telefono: telefono || null }).select('id, codigo, trial_ends_at').single();
  if (e1 || !b) return json({ error: 'No se pudo crear la barbería' }, 500);

  const { data: u, error: e2 } = await sb.auth.admin.createUser({
    email: emailStaff(b.codigo, usuario), password: clave, email_confirm: true,
    app_metadata: { rol: 'dueno', barberia_id: b.id }, user_metadata: { contacto: email },
  });
  if (e2 || !u.user) {
    await sb.from('barberias').delete().eq('id', b.id);
    return json({ error: e2?.message?.includes('weak') ? 'Clave demasiado débil' : 'No se pudo crear la cuenta' }, 400);
  }
  await sb.from('barberias').update({ owner_id: u.user.id }).eq('id', b.id);
  await sb.from('pisos').insert({ barberia_id: b.id, numero_piso: 1, nombre: 'Piso 1' });

  return json({ codigo: b.codigo, trial_ends_at: b.trial_ends_at });
};
