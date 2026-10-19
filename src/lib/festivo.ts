// Temas festivos: decoran la portada (overlay de partículas + saludo) y el
// diorama 3D (partículas de color). El dueño elige en el admin; 'auto' deja que
// la fecha decida y 'ninguno' lo apaga. Todo se resuelve en cliente con la fecha
// local (una barbería de Lima), así que no hace falta rebuild.

export type TemaFestivo =
  | 'auto' | 'ninguno'
  | 'halloween' | 'navidad' | 'anio_nuevo' | 'san_valentin' | 'fiestas_patrias';

export interface DefTema {
  id: Exclude<TemaFestivo, 'auto' | 'ninguno'>;
  nombre: string;    // etiqueta en el admin
  emojis: string[];  // partículas del overlay 2D
  saludo: string;    // banner en el hero
  color: string;     // acento y partículas 3D
}

export const TEMAS: Record<DefTema['id'], DefTema> = {
  halloween:       { id: 'halloween',       nombre: 'Halloween',        emojis: ['🎃', '🦇', '👻', '🕸️'],       saludo: '🎃 Especial Halloween',          color: '#f97316' },
  navidad:         { id: 'navidad',         nombre: 'Navidad',          emojis: ['❄️', '🎄', '🎅', '⛄', '🎁'],  saludo: '🎄 ¡Felices Fiestas!',           color: '#e2e8f0' },
  anio_nuevo:      { id: 'anio_nuevo',      nombre: 'Año Nuevo',        emojis: ['🎉', '✨', '🎊', '🥂'],         saludo: '🎆 ¡Feliz Año Nuevo!',           color: '#fcd34d' },
  san_valentin:    { id: 'san_valentin',    nombre: 'San Valentín',     emojis: ['💗', '💕', '❤️', '💘'],         saludo: '💘 San Valentín',                color: '#f472b6' },
  fiestas_patrias: { id: 'fiestas_patrias', nombre: 'Fiestas Patrias',  emojis: ['🇵🇪', '🎉', '🎊', '⭐'],        saludo: '🇵🇪 ¡Felices Fiestas Patrias!',  color: '#ef4444' },
};

/** Tema que corresponde a una fecha (rangos fijos, mes 1-12). null fuera de temporada. */
export function temaAuto(fecha = new Date()): DefTema | null {
  const m = fecha.getMonth() + 1, d = fecha.getDate();
  if (m === 10 && d >= 24) return TEMAS.halloween;
  if (m === 2 && d >= 10 && d <= 15) return TEMAS.san_valentin;
  if (m === 7 && d >= 26) return TEMAS.fiestas_patrias;
  if (m === 12 && d >= 15 && d <= 30) return TEMAS.navidad;
  if ((m === 12 && d === 31) || (m === 1 && d <= 2)) return TEMAS.anio_nuevo;
  return null;
}

/** Resuelve el valor guardado a un tema concreto (o null = sin decoración). */
export function temaActivo(valor?: string | null, fecha = new Date()): DefTema | null {
  if (valor === 'ninguno') return null;
  if (valor && valor in TEMAS) return TEMAS[valor as DefTema['id']];
  return temaAuto(fecha); // 'auto', undefined o valor desconocido
}
