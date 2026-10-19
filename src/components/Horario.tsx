import type { Horario } from '@/lib/tipos';
import { DIAS } from '@/lib/tipos';

/** Horario semanal: un switch y dos <input type="time"> por día. */
export default function EditorHorario({ valor, onChange }: { valor: Horario; onChange: (h: Horario) => void }) {
  const set = (d: string, f: [string, string] | null) => onChange({ ...valor, [d]: f });
  return (
    <div className="grid gap-1.5">
      {['1', '2', '3', '4', '5', '6', '7'].map((d) => {
        const f = valor[d];
        return (
          <div key={d} className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-2 w-28">
              <input type="checkbox" className="accent-acento-500 size-4" checked={!!f} onChange={(e) => set(d, e.target.checked ? ['09:00', '20:00'] : null)} />
              {DIAS[+d]}
            </label>
            {f ? (
              <>
                <input type="time" className="campo !w-auto !py-1" value={f[0]} onChange={(e) => set(d, [e.target.value, f[1]])} aria-label={`${DIAS[+d]} desde`} />
                <span>–</span>
                <input type="time" className="campo !w-auto !py-1" value={f[1]} onChange={(e) => set(d, [f[0], e.target.value])} aria-label={`${DIAS[+d]} hasta`} />
              </>
            ) : <span className="text-base-400 text-xs">Cerrado / no atiende</span>}
          </div>
        );
      })}
    </div>
  );
}
