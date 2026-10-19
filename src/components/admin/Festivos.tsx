import { useState } from 'react';
import { msg, supabase } from '@/lib/supabase';
import { TEMAS, temaActivo, temaAuto, type TemaFestivo } from '@/lib/festivo';
import type { useBarberia } from '@/lib/useBarberia';
import { Aviso } from '../ui';

const OPCIONES: { v: TemaFestivo; t: string; d: string }[] = [
  { v: 'auto', t: '✨ Automático por fecha', d: 'El sitio se decora solo en cada temporada. Recomendado.' },
  { v: 'ninguno', t: '⚪ Sin decoración', d: 'Apaga todos los efectos festivos.' },
  ...Object.values(TEMAS).map((x) => ({ v: x.id as TemaFestivo, t: `${x.emojis[0]} ${x.nombre}`, d: `Forzar ${x.nombre} todo el año (para probarlo).` })),
];

/** Elige el tema festivo de la barbería. Se guarda al instante en `tema_festivo`. */
export default function Festivos({ datos, recargar }: { datos: NonNullable<ReturnType<typeof useBarberia>['datos']>; recargar: () => void }) {
  const { barberia } = datos;
  const [val, setVal] = useState<TemaFestivo>((barberia.tema_festivo as TemaFestivo) ?? 'auto');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const activo = temaActivo(val);
  const hoy = temaAuto();

  async function elegir(v: TemaFestivo) {
    setVal(v); setError(''); setOk('');
    const { error } = await supabase.from('barberias').update({ tema_festivo: v }).eq('id', barberia.id);
    if (error) return setError(msg(error));
    setOk('Guardado ✅ — abre la web pública para verlo.');
    recargar();
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h3 className="titulo">🎉 Efectos por días festivos</h3>
        <p className="text-sm text-base-500">
          Decora tu portada y el local en 3D en Halloween, Navidad, Fiestas Patrias y más.
          En modo automático aparecen solos: {hoy ? <b style={{ color: hoy.color }}>hoy toca {hoy.nombre}</b> : 'hoy no hay temporada activa'}.
        </p>
      </section>

      <section className="grid sm:grid-cols-2 gap-3">
        {OPCIONES.map((o) => (
          <button key={o.v} onClick={() => elegir(o.v)} aria-pressed={val === o.v}
            className="neu-sm neu-press rounded-xl p-3 text-left aria-pressed:neu-inset aria-pressed:ring-2 aria-pressed:ring-acento-500/60">
            <b className="text-sm block">{o.t}</b>
            <span className="text-xs text-base-500">{o.d}</span>
          </button>
        ))}
      </section>

      {/* Vista previa de lo que verán los clientes ahora mismo */}
      <section className="neu rounded-2xl p-4 grid gap-2">
        <span className="etiqueta">Vista previa (lo que se muestra ahora)</span>
        {activo ? (
          <div className="flex items-center gap-3">
            <span className="text-3xl">{activo.emojis.join(' ')}</span>
            <span className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: `${activo.color}26`, border: `1px solid ${activo.color}66`, color: activo.color }}>
              {activo.saludo}
            </span>
          </div>
        ) : <p className="text-sm text-base-400">Sin decoración en este momento.</p>}
      </section>

      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
    </div>
  );
}
