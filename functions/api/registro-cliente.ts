import { admin, json, mismoOrigen, type Env } from '../../server/lib';

// Alta de cliente por celular+clave. El email es ficticio: Supabase se queja si
// no está confirmado, así que lo creamos ya confirmado desde el servidor (service key).
const emailCliente = (celular: string) =>
  `${celular.replace(/\D/g, '')}@cliente.labarberiaestadio.pages.dev`;

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido' }, 403);
  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const nombre = String(body.nombre ?? '').trim();
  const celular = String(body.celular ?? '').replace(/\D/g, '');
  const clave = String(body.clave ?? '');

  if (nombre.length < 2 || nombre.length > 60) return json({ error: 'Nombre inválido' }, 400);
  if (celular.length < 6 || celular.length > 15) return json({ error: 'Celular inválido' }, 400);
  if (clave.length < 6) return json({ error: 'La clave necesita al menos 6 caracteres' }, 400);

  const sb = admin(env);
  const { data: u, error } = await sb.auth.admin.createUser({
    email: emailCliente(celular), password: clave, email_confirm: true,
    user_metadata: { nombre, telefono: celular },
  });
  if (error || !u.user) {
    const t = error?.message ?? '';
    if (/already (been )?registered|user_already_exists|duplicate/i.test(t)) {
      return json({ error: 'Ese celular ya tiene cuenta. Entra con tu clave.' }, 400);
    }
    return json({ error: /weak/i.test(t) ? 'Clave demasiado débil' : 'No se pudo crear la cuenta' }, 400);
  }
  // La fila en public.clientes se crea cuando el navegador llame a registrar_cliente_celular
  // tras el signInWithPassword — así hereda auth.uid() correcto.
  return json({ ok: true });
};
