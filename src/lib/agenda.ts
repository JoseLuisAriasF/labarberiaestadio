import type { Horario } from './tipos';

// ponytail: Perú no tiene horario de verano, así que Lima = UTC-5 fijo. Si se
// abre en otro país, pasar a Intl.DateTimeFormat con la zona de la barbería.
const OFFSET = '-05:00';

export const hoyLima = (d = new Date()) => new Date(d.getTime() - 5 * 3600e3).toISOString().slice(0, 10);
export const isoDow = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7;
const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const sumarDias = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export interface Bloque { hora: string; inicio: Date; libre: boolean; motivo?: string }

/** Bloques reservables de un día: dentro del horario, sin pisar citas, no en el pasado. */
export function bloquesDelDia(
  fecha: string, horario: Horario, duracion: number,
  ocupados: { inicio: string; fin: string }[], ahora = new Date(), paso = 30,
): Bloque[] {
  const franja = horario[String(isoDow(fecha))];
  if (!franja) return [];
  const limite = ahora.getTime() + 10 * 60e3; // misma regla que reservar_cita()
  const occ = ocupados.map((o) => [Date.parse(o.inicio), Date.parse(o.fin)]);
  const out: Bloque[] = [];
  for (let m = aMin(franja[0]); m + duracion <= aMin(franja[1]); m += paso) {
    const hora = aHora(m);
    const inicio = new Date(`${fecha}T${hora}:00${OFFSET}`);
    const a = inicio.getTime(), b = a + duracion * 60e3;
    const pisa = occ.some(([x, y]) => a < y && b > x);
    out.push({ hora, inicio, libre: !pisa && a >= limite, motivo: pisa ? 'Ocupado' : a < limite ? 'Ya pasó' : undefined });
  }
  return out;
}

/** "¿Está abierto ahora?" para la ficha y Cómo llegar. */
export function abiertoAhora(horario: Horario, ahora = new Date()) {
  const f = horario[String(isoDow(hoyLima(ahora)))];
  if (!f) return false;
  const lima = new Date(ahora.getTime() - 5 * 3600e3);
  const m = lima.getUTCHours() * 60 + lima.getUTCMinutes();
  return m >= aMin(f[0]) && m < aMin(f[1]);
}
