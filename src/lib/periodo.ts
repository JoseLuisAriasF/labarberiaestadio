import { hoyLima, isoDow, sumarDias } from './agenda';

/** Día, semana (lunes a domingo) o mes. Todo en hora de Lima (UTC-5 fijo). */
export type Periodo = 'dia' | 'semana' | 'mes';

/** Desde incluido, hasta excluido (YYYY-MM-DD). */
export interface Rango { desde: string; hasta: string; dias: number }

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/** Rango del periodo que contiene la fecha de referencia. */
export function rangoDe(periodo: Periodo, fecha: string): Rango {
  let desde = fecha, hasta = sumarDias(fecha, 1);
  if (periodo === 'semana') {
    desde = sumarDias(fecha, 1 - isoDow(fecha));
    hasta = sumarDias(desde, 7);
  } else if (periodo === 'mes') {
    desde = `${fecha.slice(0, 7)}-01`;
    const [y, m] = desde.split('-').map(Number);
    hasta = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
  return { desde, hasta, dias: diasEntre(desde, hasta) };
}

/** Mueve la referencia una unidad del periodo (n = -1 anterior, 1 siguiente). */
export function desplazar(periodo: Periodo, fecha: string, n: number): string {
  if (periodo === 'dia') return sumarDias(fecha, n);
  if (periodo === 'semana') return sumarDias(fecha, 7 * n);
  const [y, m] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Días del rango que ya ocurrieron (o el día de hoy). Sirve para calcular el ritmo de venta. */
export function diasTranscurridos(rango: Rango, hoy = hoyLima()): number {
  const hastaReal = hoy < rango.hasta ? sumarDias(hoy, 1) : rango.hasta;
  return Math.max(1, Math.min(rango.dias, diasEntre(rango.desde, hastaReal)));
}

const fechaCorta = (f: string) => new Date(`${f}T12:00:00-05:00`)
  .toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric' });

/** Texto que ve el admin: "lun 27 oct 2026", "27 oct – 2 nov 2026" u "octubre 2026". */
export function etiquetaPeriodo(periodo: Periodo, fecha: string): string {
  const r = rangoDe(periodo, fecha);
  if (periodo === 'dia') return new Date(`${fecha}T12:00:00-05:00`)
    .toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  if (periodo === 'semana') return `${fechaCorta(r.desde)} – ${fechaCorta(sumarDias(r.hasta, -1))}`;
  return new Date(`${r.desde}T12:00:00-05:00`)
    .toLocaleDateString('es-PE', { timeZone: 'America/Lima', month: 'long', year: 'numeric' });
}
