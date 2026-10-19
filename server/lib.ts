import { createClient } from '@supabase/supabase-js';

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  TURNSTILE_SECRET?: string;
  DEPLOY_HOOK_URL?: string;
}

// Las Pages Functions son el ÚNICO sitio con la service key: crean cuentas de
// Auth (dueños y barberos), que desde el navegador no se puede ni se debe.
export const admin = (env: Env) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

export const USUARIO = /^[a-z0-9_]{3,24}$/;
export const emailStaff = (codigo: string, usuario: string) =>
  `${usuario.toLowerCase()}.${codigo.toLowerCase()}@staff.labarberiaestadio.pages.dev`;

/** Mismo origen o nada: corta llamadas cruzadas desde otras webs. */
export const mismoOrigen = (req: Request) => {
  const o = req.headers.get('Origin');
  return !o || o === new URL(req.url).origin;
};

export async function turnstileOk(env: Env, token: unknown, ip: string | null) {
  if (!env.TURNSTILE_SECRET) return true; // sin configurar → no se exige (dev)
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token ?? ''), remoteip: ip ?? '' }),
  }).then((x) => x.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
  return r.success;
}
