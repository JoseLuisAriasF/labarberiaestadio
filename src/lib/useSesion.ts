import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { emailCliente, msg, supabase, suscribirPush } from './supabase';
import type { Cliente } from './tipos';

/** Sesión del cliente (Google) + su ficha con DNI, si ya la creó. */
export function useSesion() {
  const [user, setUser] = useState<User | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarCliente = useCallback(async (u: User | null) => {
    if (!u) { setCliente(null); return; }
    const { data } = await supabase.from('clientes').select('*').eq('usuario_id', u.id).maybeSingle();
    if (!data && u.email?.endsWith('@cliente.labarberiaestadio.pages.dev')) {
      const nombre = String(u.user_metadata?.nombre ?? '').trim() || 'Cliente';
      const creada = await supabase.rpc('registrar_cliente_celular', { p_nombre: nombre, p_telefono: u.email.split('@')[0] });
      setCliente(creada.data as Cliente | null);
      return;
    }
    setCliente(data);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      await cargarCliente(data.user);
      if (data.user) suscribirPush();
      setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      cargarCliente(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [cargarCliente]);

  return { user, cliente, setCliente, cargando, recargar: () => cargarCliente(user) };
}

export const entrarConGoogle = () =>
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.href, queryParams: { prompt: 'select_account' } },
  });

/** Login de cliente por celular (usuario) + clave: email sintético, mismo truco que staff. */
export const entrarConCelular = (celular: string, clave: string) =>
  supabase.auth.signInWithPassword({ email: emailCliente(celular), password: clave });

/** Crea cuenta de cliente con celular+clave. El endpoint usa service key para auto-confirmar
    el email (es ficticio, no llega ningún correo). Luego entra y crea su ficha. */
export async function crearCuentaCliente(nombre: string, celular: string, clave: string) {
  const r = await fetch('/api/registro-cliente', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, celular, clave }),
  }).then((x) => x.json() as Promise<{ ok?: boolean; error?: string }>).catch(() => ({ error: 'Sin conexión' }));
  if (r.error) return { error: { message: r.error } as const };
  const si = await supabase.auth.signInWithPassword({ email: emailCliente(celular), password: clave });
  if (si.error) return si;
  const ficha = await supabase.rpc('registrar_cliente_celular', { p_nombre: nombre, p_telefono: celular });
  if (ficha.error) return { error: { message: msg(ficha.error) } as const };
  suscribirPush();
  return si;
}
