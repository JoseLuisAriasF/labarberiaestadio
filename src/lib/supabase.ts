import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.PUBLIC_SUPABASE_URL as string;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;

// Sin credenciales (build en CI sin .env) se crea igual; las llamadas fallan suaves.
export const supabase = createClient(URL || 'https://sin-configurar.supabase.co', KEY || 'sin-configurar', {
  auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true },
});

/** Código de barbería que se está viendo: ?b=B2, o la de la portada. */
export function codigoActual(): string {
  const q = new URLSearchParams(location.search).get('b');
  return (q && /^B\d{1,6}$/i.test(q) ? q : (import.meta.env.PUBLIC_BARBERIA || 'B1')).toUpperCase();
}

/** El personal entra con código + usuario + clave (como un POS). Por debajo es
    una cuenta de Supabase con este correo sintético, que nadie escribe. */
export const emailStaff = (codigo: string, usuario: string) =>
  `${usuario.trim().toLowerCase()}.${codigo.trim().toLowerCase()}@staff.labarberiaestadio.pages.dev`;

/** Mensaje legible de un error de Supabase/Postgres (los RAISE ya vienen en español). */
export const msg = (e: unknown) =>
  (e as { message?: string })?.message?.replace(/^.*?ERROR:\s*/, '') || 'Algo salió mal. Intenta otra vez.';

/** Sube una imagen al bucket y devuelve su ruta (y URL pública si el bucket lo es). */
export async function subirImagen(bucket: 'publico' | 'comprobantes', carpeta: string, archivo: File) {
  if (archivo.size > 5 * 1024 * 1024) throw new Error('La imagen supera 5 MB');
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) throw new Error('Solo JPG, PNG o WEBP');
  const ext = archivo.type.split('/')[1];
  const ruta = `${carpeta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(ruta, archivo, { contentType: archivo.type });
  if (error) throw error;
  return { ruta, url: bucket === 'publico' ? supabase.storage.from(bucket).getPublicUrl(ruta).data.publicUrl : '' };
}

export async function urlComprobante(ruta: string) {
  const { data } = await supabase.storage.from('comprobantes').createSignedUrl(ruta, 600);
  return data?.signedUrl;
}
