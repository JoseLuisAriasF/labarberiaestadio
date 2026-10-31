import { AnimatePresence, motion } from 'motion/react';
import { CalendarDays, CircleCheckBig, IdCard, Lightbulb, PartyPopper, Scissors, UserRound, X } from 'lucide-react';

/** 'no': aún no empezó · 'si': visible · 'oculta': el cliente la cerró (vuelve al tocar "Reservar ahora"). */
export type EstadoGuia = 'no' | 'si' | 'oculta';

const PASOS = [
  { t: 'Elige tu barbero', i: UserRound },
  { t: 'Elige tu corte', i: Scissors },
  { t: 'Elige día y hora', i: CalendarDays },
  { t: 'Tus datos', i: IdCard },
  { t: 'Confirma', i: CircleCheckBig },
] as const;

/** Guía de la reserva: dice qué tocar ahora y avanza sola con lo que hace el cliente. */
export function GuiaReserva({ paso, texto, listo, onOcultar, className = '' }: {
  paso: number; texto: string; listo?: boolean; onOcultar: () => void; className?: string;
}) {
  const Icono = listo ? PartyPopper : PASOS[paso - 1].i;
  return (
    <div role="status" aria-live="polite" className={`guia-reserva ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-acento-400">
          {listo ? '¡Terminaste!' : `Paso ${paso} de ${PASOS.length}`}
        </span>
        <button type="button" onClick={onOcultar} className="-my-2 -mr-2 inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-xs font-semibold text-[var(--texto-suave)] hover:text-[var(--texto)]">
          Ocultar guía <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden="true">
        {PASOS.map((p, n) => (
          <span key={p.t} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${listo || n < paso ? 'bg-acento-400' : 'bg-[var(--borde)]'}`} />
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={listo ? 'listo' : `${paso}-${texto}`} className="mt-3 flex items-start gap-3"
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-acento-400 text-black"><Icono className="size-5" /></span>
          <span className="min-w-0">
            <span className="block text-base font-bold leading-snug">{listo ? '¡Tu reserva está hecha!' : PASOS[paso - 1].t}</span>
            <span className="mt-0.5 block text-[0.9375rem] leading-snug text-[var(--texto-suave)]">{texto}</span>
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function VerGuia({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="chip min-h-10 w-fit !px-3 !text-sm">
      <Lightbulb className="size-4" /> Ver guía paso a paso
    </button>
  );
}
