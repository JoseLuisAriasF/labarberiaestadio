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

/** Subdominio de la barbería (elestadiobarberia.pages.dev → elestadiobarberia); null en el sitio raíz. */
export function slugActual(): string | null {
  const h = location.hostname;
  if (!h.endsWith('.pages.dev') || h === 'labarberiaestadio.pages.dev') return null;
  const s = h.split('.')[0].toLowerCase();
  return /^[a-z0-9-]{3,40}$/.test(s) ? s : null;
}

/** El personal entra con código + usuario + clave (como un POS). Por debajo es
    una cuenta de Supabase con este correo sintético, que nadie escribe. */
export const emailStaff = (codigo: string, usuario: string) =>
  `${usuario.trim().toLowerCase()}.${codigo.trim().toLowerCase()}@staff.labarberiaestadio.pages.dev`;

/** Mensaje legible de un error de Supabase/Postgres (los RAISE ya vienen en español). */
const AYUDA: [RegExp, string][] = [
  [/is of type jsonb|invalid input syntax for type json/i, 'Un dato no tiene el formato correcto. Revisa los campos (horario, especialidades) y vuelve a guardar. Si sigue, recarga la página.'],
  [/violates check constraint/i, 'Un dato no cumple la regla. Revisa el largo o el formato (por ejemplo, el DNI son 8 números y el usuario sin espacios ni mayúsculas).'],
  [/duplicate key|already exists/i, 'Ya existe un registro con ese dato (un DNI, usuario o cita repetida). Busca el existente antes de crear otro.'],
  [/null value in column/i, 'Falta llenar un campo obligatorio. Completa todos los campos marcados.'],
  [/row-level security|permission denied|Sin permiso|Solo personal|No eres dueño/i, 'No tienes permiso para esta acción. Entra con la cuenta de la barbería correcta.'],
];

export const msg = (e: unknown) => {
  const texto = (e as { message?: string })?.message ?? '';
  const ayuda = AYUDA.find(([re]) => re.test(texto));
  return ayuda ? ayuda[1] : texto.replace(/^.*?ERROR:\s*/, '') || 'Algo salió mal. Intenta otra vez.';
};

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

export const VAPID_PUBLIC_KEY = 'BKxlvgaU0HwHLLLA3NhN1ZAu3OR_RIHlNtpXJ_9gXwqeQB-K5g2jbImW1BnVUmLkhjSWYySiXzFu8NaHfmHfvxE';

/** Suscribe al usuario a push notifications. Fire-and-forget. */
export async function suscribirPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY });
    }
    const key = sub.toJSON();
    const session = (await supabase.auth.getSession()).data.session;
    if (!session || !key.endpoint) return;
    fetch('/api/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ endpoint: key.endpoint, p256dh: key.keys?.p256dh, auth: key.keys?.auth }),
    }).catch(() => {});
  } catch {}
}

/** Fire-and-forget: notifica por email al barbero y/o cliente. No bloquea ni lanza errores. */
export function notificar(tipo: 'cita_confirmada' | 'cita_nueva' | 'pago_recibido' | 'cita_cancelada' | 'cita_reprogramada', cita_id: string) {
  supabase.auth.getSession().then(({ data: { session } }) => {
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ tipo, cita_id }),
    }).catch(() => {});
  });
}
