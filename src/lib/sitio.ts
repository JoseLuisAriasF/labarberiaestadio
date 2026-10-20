// Datos de la barbería principal leídos EN EL BUILD, para que el HTML que ve
// Google (título, dirección, coordenadas, horario, productos) no dependa de JS.
// El admin pulsa "Publicar en Google" y un deploy hook regenera el sitio.
import type { Barberia, Producto, Servicio } from './tipos';

const URL_SB = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const CODIGO = (import.meta.env.PUBLIC_BARBERIA || 'B1').toUpperCase();

async function rest<T>(ruta: string): Promise<T[]> {
  if (!URL_SB || !KEY) return [];
  try {
    const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    return r.ok ? r.json() : [];
  } catch { return []; }
}

// Fallback con los datos reales de B4 (El Estadio Barbería, Tacna): si el fetch a
// Supabase falla en build, el HTML igual sale con la dirección, teléfono y horario correctos.
const RESPALDO: Barberia = {
  id: '', codigo: CODIGO, nombre: 'El Estadio Barbería',
  descripcion: 'Barbería en Coronel Gregorio Albarracín, Tacna. Cortes clásicos, fades, degradados y barba con reservas en tiempo real. Pagos con Yape, Plin, transferencia o efectivo.',
  whatsapp: '51922525513',
  direccion: 'Asoc. San Francisco Mz.13 Lt 05',
  referencia: 'Financiera "Confianza" y Veterinaria "Santa Rosa"',
  distrito: 'Coronel Gregorio Albarracín', ciudad: 'Tacna',
  lat: -18.047052, lng: -70.247161,
  horario: { '1': ['09:00', '21:00'], '2': ['09:00', '21:00'], '3': ['09:00', '21:00'], '4': ['09:00', '21:00'], '5': ['09:00', '21:00'], '6': ['09:00', '21:00'], '7': ['09:00', '20:00'] },
  fotos: [], modo_financiero: 'CENTRALIZADO', modo_gamificacion: 'POR_BARBERO', comision_pct: 50, alquiler_mensual: 0,
  plan: 'TRIAL', trial_ends_at: '',
};

let cache: Promise<{ b: Barberia; productos: Producto[]; servicios: Servicio[] }> | null = null;
export function datosSitio() {
  return (cache ??= (async () => {
    const [b] = await rest<Barberia>(`barberias?codigo=eq.${CODIGO}&select=*`);
    if (!b) return { b: RESPALDO, productos: [], servicios: [] };
    const [productos, servicios] = await Promise.all([
      rest<Producto>(`productos?barberia_id=eq.${b.id}&activo=eq.true&order=nombre`),
      rest<Servicio>(`servicios_cortes?barberia_id=eq.${b.id}&activo=eq.true&order=precio_base`),
    ]);
    return { b, productos, servicios };
  })());
}

const DIA_SCHEMA = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** schema.org BarberShop: lo que leen Google Maps/Search y los motores generativos. */
export function jsonLdBarberia(b: Barberia, site: URL, servicios: Servicio[] = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BarberShop',
    '@id': new URL('/#barberia', site).toString(),
    name: b.nombre,
    // Variantes con/sin tilde, con/sin espacios, con/sin "el"/"la" y con "tacna":
    // así una búsqueda literal "elestadiobarberia", "el estadio barberia tacna",
    // "estadio barberia", etc. mapea a esta ficha.
    alternateName: [
      'El Estadio Barbería', 'El Estadio Barberia',
      'El Estadio Barbería Tacna', 'El Estadio Barberia Tacna',
      'Estadio Barbería', 'Estadio Barberia',
      'Estadio Barbería Tacna', 'Estadio Barberia Tacna',
      'La Barbería Estadio', 'La Barberia Estadio',
      'La Barbería Estadio Tacna', 'La Barberia Estadio Tacna',
      'elestadiobarberia', 'elestadiobarbería',
      'elestadiobarberiatacna', 'elestadiobarberíatacna',
      'estadiobarberia', 'estadiobarbería',
      'estadiobarberiatacna', 'estadiobarberíatacna',
      'el-estadio-barberia', 'el-estadio-barberia-tacna',
      'labarberiaestadio', 'labarberíaestadio',
    ],
    description: b.descripcion || undefined,
    areaServed: [{ '@type': 'City', name: b.ciudad || 'Tacna' }, { '@type': 'AdministrativeArea', name: 'Tacna' }],
    knowsAbout: [
      'Barbería en Tacna', 'Barberia en Tacna',
      'Mejor barbería Tacna', 'Mejor barberia Tacna',
      'Barbería Tacna cerca de mí', 'Barberia Tacna cerca de mi',
      'Corte de cabello Tacna', 'Fade Tacna', 'Degradado Tacna', 'Barba Tacna',
      'Barbería Coronel Gregorio Albarracín', 'Barberia Cono Sur Tacna',
    ],
    url: site.toString(),
    image: b.fotos?.[0] || new URL('/og.png', site).toString(),
    logo: new URL('/icono-512.png', site).toString(),
    telephone: b.telefono || b.whatsapp || undefined,
    priceRange: 'S/ 15 - S/ 80',
    currenciesAccepted: 'PEN',
    paymentAccepted: 'Efectivo, Yape, Plin, Transferencia',
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.direccion || undefined,
      addressLocality: b.distrito || b.ciudad || 'Tacna',
      addressRegion: b.ciudad || 'Tacna',
      addressCountry: 'PE',
    },
    geo: b.lat != null && b.lng != null ? { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng } : undefined,
    hasMap: b.lat != null ? `https://www.google.com/maps?q=${b.lat},${b.lng}` : undefined,
    openingHoursSpecification: Object.entries(b.horario || {})
      .filter(([, f]) => f)
      .map(([d, f]) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DIA_SCHEMA[+d], opens: f![0], closes: f![1] })),
    sameAs: [
      'https://www.tiktok.com/@el.estadio_barberia',
      'https://www.facebook.com/ElestadioBarberia/',
    ],
    potentialAction: { '@type': 'ReserveAction', target: new URL('/#reservar', site).toString() },
    makesOffer: servicios.map((s) => ({
      '@type': 'Offer', price: s.precio_base, priceCurrency: 'PEN',
      itemOffered: { '@type': 'Service', name: s.nombre, description: s.descripcion || undefined },
    })),
  };
}
