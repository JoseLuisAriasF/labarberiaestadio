import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { emailCliente, supabase, suscribirPush } from './supabase';
import type { Cliente } from './tipos';

/** Sesión del cliente (Google) + su ficha con DNI, si ya la creó. */
export function useSesion() {
  const [user, setUser] = useState<User | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargarCliente = useCallback(async (u: User | null) => {
    if (!u) { setCliente(null); return; }
    const { data } = await supabase.from('clientes').select('*').eq('usuario_id', u.id).maybeSingle();
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

/** Crea cuenta de cliente con celular+clave y guarda su ficha (nombre+telefono). */
export async function crearCuentaCliente(nombre: string, celular: string, clave: string) {
  const up = await supabase.auth.signUp({ email: emailCliente(celular), password: clave });
  if (up.error) return up;
  if (up.data.user) {
    await supabase.rpc('registrar_cliente_celular', { p_nombre: nombre, p_telefono: celular });
    suscribirPush();
  }
  return up;
}
