import { ChevronLeft, ChevronRight } from 'lucide-react';
import { hoyLima } from '@/lib/agenda';
import { desplazar, etiquetaPeriodo, rangoDe, type Periodo } from '@/lib/periodo';

export const PERIODOS: [Periodo, string][] = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']];

/** Elige Día, Semana o Mes; navega con ‹ › y vuelve a hoy. Lo usan Estadísticas y Finanzas. */
export default function SelectorPeriodo({ periodo, fecha, onPeriodo, onFecha }: {
  periodo: Periodo; fecha: string; onPeriodo: (p: Periodo) => void; onFecha: (f: string) => void;
}) {
  const esActual = rangoDe(periodo, hoyLima()).desde === rangoDe(periodo, fecha).desde;
  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="Periodo" className="neu-inset grid grid-cols-3 gap-1 rounded-2xl p-1">
        {PERIODOS.map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={periodo === v} onClick={() => onPeriodo(v)}
            className="min-h-11 rounded-xl text-sm font-semibold text-[var(--texto-suave)] transition-colors aria-checked:bg-acento-500 aria-checked:text-black">
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <button type="button" aria-label="Periodo anterior" onClick={() => onFecha(desplazar(periodo, fecha, -1))} className="btn !p-2"><ChevronLeft className="size-5" /></button>
        <p className="text-center text-sm font-semibold leading-snug">{etiquetaPeriodo(periodo, fecha)}</p>
        <button type="button" aria-label="Periodo siguiente" onClick={() => onFecha(desplazar(periodo, fecha, 1))} className="btn !p-2"><ChevronRight className="size-5" /></button>
      </div>
      <div className="flex items-center justify-between gap-2">
        {!esActual
          ? <button type="button" onClick={() => onFecha(hoyLima())} className="min-h-10 rounded-xl px-3 text-sm font-semibold text-acento-400 underline">Ir a hoy</button>
          : <span />}
        <input type={periodo === 'mes' ? 'month' : 'date'} aria-label="Elegir fecha" className="campo !w-auto min-h-10 !py-1.5 text-sm"
          value={periodo === 'mes' ? fecha.slice(0, 7) : fecha}
          onChange={(e) => e.target.value && onFecha(periodo === 'mes' ? `${e.target.value}-01` : e.target.value)} />
      </div>
    </div>
  );
}
