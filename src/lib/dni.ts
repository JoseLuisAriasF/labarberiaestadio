import { supabase } from './supabase';

/** Nombre y apellidos desde el DNI (endpoint /api/dni, solo personal de la barbería). */
export async function consultarDni(dni: string): Promise<{ nombre?: string; error?: string }> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const r = await fetch(`/api/dni/${dni}`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json()).catch(() => null);
  if (!r || r.error) return { error: r?.error || 'No se pudo consultar. Escribe el nombre a mano.' };
  if (!r.encontrado) return { error: 'DNI no encontrado. Escribe el nombre a mano.' };
  return { nombre: `${r.nombres} ${r.apellidos}`.trim() };
}
