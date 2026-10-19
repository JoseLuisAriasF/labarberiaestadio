import { json, mismoOrigen, type Env } from '../../server/lib';
import { createClient } from '@supabase/supabase-js';

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  if (!mismoOrigen(request)) return json({ error: 'Origen no permitido' }, 403);

  const jwt = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'No autenticado' }, 401);

  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: { user } } = await sb.auth.getUser(jwt);
  if (!user) return json({ error: 'Token inválido' }, 401);

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { endpoint, p256dh, auth: authKey } = body as { endpoint?: string; p256dh?: string; auth?: string };
  if (!endpoint || !p256dh || !authKey) return json({ error: 'endpoint, p256dh y auth requeridos' }, 400);

  const action = (body.action as string) || 'subscribe';

  if (action === 'unsubscribe') {
    await sb.from('push_subscriptions').delete().eq('usuario_id', user.id).eq('endpoint', endpoint);
    return json({ ok: true, action: 'unsubscribed' });
  }

  const { error } = await sb.from('push_subscriptions').upsert(
    { usuario_id: user.id, endpoint, p256dh, auth_key: authKey },
    { onConflict: 'usuario_id,endpoint' },
  );
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, action: 'subscribed' });
};
