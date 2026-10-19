import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, Users } from 'lucide-react';
import { codigoActual } from '@/lib/supabase';
import { useBarberia } from '@/lib/useBarberia';
import { abiertoAhora, hoyLima, isoDow } from '@/lib/agenda';
import type { Barbero } from '@/lib/tipos';
import { ESTADOS, soles } from '@/lib/tipos';
import Reserva, { leerBorrador } from './Reserva';
import { Aviso, Cargando, Hoja } from './ui';

// Three.js pesa: se baja aparte, sin frenar el primer pintado de la página.
const Barberia3D = lazy(() => import('./three/Barberia3D'));

export default function Inicio() {
  const codigo = useMemo(codigoActual, []);
  const { datos, error, enVivo } = useBarberia({ codigo });
  const [pisoId, setPisoId] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [reservando, setReservando] = useState(false);

  // Vuelta del login de Google con una reserva a medias: reabrirla.
  useEffect(() => {
    const b = leerBorrador();
    if (datos && b && datos.barberos.some((x) => x.id === b.barberoId)) { setFichaId(b.barberoId); setReservando(true); }
  }, [!!datos]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!datos) return <Cargando texto="Abriendo la barbería…" />;

  const { barberia, pisos, sillas, barberos } = datos;
  const pisoActual = pisoId ?? pisos[0]?.id ?? null;
  const ficha = barberos.find((b) => b.id === fichaId) ?? null;
  const delPiso = sillas.filter((s) => s.piso_id === pisoActual);
  const activos = barberos.filter((b) => b.activo);
  const libres = activos.filter((b) => b.estado === 'LIBRE').length;
  const enCola = activos.reduce((n, b) => n + b.cola, 0);
  const abierto = abiertoAhora(barberia.horario);
  const pisoDe = (b: Barbero) => pisos.find((p) => p.id === sillas.find((s) => s.barbero_id === b.id)?.piso_id);

  return (
    <div className="grid gap-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo text-2xl sm:text-3xl">{barberia.nombre}</h1>
          <p className="text-sm text-base-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 ${enVivo ? 'text-red-500' : 'text-base-400'}`}>
              <span className={`size-2 rounded-full ${enVivo ? 'bg-red-500 animate-pulse' : 'bg-base-400'}`} /> {enVivo ? 'EN VIVO' : 'conectando…'}
            </span>
            · {abierto ? <span className="text-green-500">Abierto ahora</span> : <span>Cerrado ahora</span>}
            · Código {barberia.codigo}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="neu-sm rounded-xl px-3 py-2">🟢 <b>{libres}</b> libres</span>
          <span className="neu-sm rounded-xl px-3 py-2"><Users className="inline size-4" /> <b>{enCola}</b> en cola</span>
        </div>
      </section>

      {pisos.length > 1 && (
        <div role="tablist" aria-label="Pisos" className="neu-inset rounded-2xl p-1 flex gap-1 w-fit max-w-full overflow-x-auto">
          {pisos.map((p) => (
            <button key={p.id} role="tab" aria-selected={p.id === pisoActual} onClick={() => setPisoId(p.id)}
              className="relative px-4 py-2 rounded-xl text-sm whitespace-nowrap aria-selected:text-acento-500">
              {p.id === pisoActual && <motion.span layoutId="piso" className="absolute inset-0 neu-sm rounded-xl" transition={{ type: 'spring', damping: 25, stiffness: 300 }} />}
              <span className="relative">{p.nombre || `Piso ${p.numero_piso}`}</span>
            </button>
          ))}
        </div>
      )}

      <Suspense fallback={<div className="h-[58vh] min-h-[360px] rounded-2xl neu-inset grid place-items-center"><Cargando texto="Montando el local en 3D…" /></div>}>
        <Barberia3D sillas={delPiso} barberos={barberos} seleccionId={fichaId} onSelect={(b) => setFichaId(b.id)} />
      </Suspense>
      <p className="text-xs text-base-400 -mt-3">Toca una silla para ver al barbero y reservar · arrastra para girar · pellizca para acercar.</p>

      {/* Lista: acceso rápido en móvil y alternativa accesible al 3D. */}
      <section id="reservar" aria-label="Barberos" className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {activos.map((b) => {
          const e = ESTADOS[b.estado];
          return (
            <button key={b.id} onClick={() => setFichaId(b.id)} className="neu neu-press rounded-2xl p-3 flex items-center gap-3 text-left">
              <Avatar b={b} />
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{b.nombre}</span>
                <span className="block text-xs text-base-500">{e.emoji} {e.texto}{pisos.length > 1 && pisoDe(b) ? ` · ${pisoDe(b)!.nombre || `Piso ${pisoDe(b)!.numero_piso}`}` : ''}</span>
              </span>
              {b.cola > 0 && <span className="chip">👥 {b.cola}</span>}
            </button>
          );
        })}
        {activos.length === 0 && <Aviso tipo="info">Aún no hay barberos registrados.</Aviso>}
      </section>

      <Hoja abierta={!!ficha} onClose={() => { setFichaId(null); setReservando(false); }} titulo={reservando ? `Reservar con ${ficha?.nombre}` : 'Barbero'}>
        {ficha && (reservando
          ? <Reserva datos={datos} barbero={ficha} onListo={() => { setReservando(false); setFichaId(null); }} />
          : <Ficha b={ficha} datos={datos} onReservar={() => setReservando(true)} />)}
      </Hoja>
    </div>
  );
}

function Avatar({ b, grande }: { b: Barbero; grande?: boolean }) {
  const t = grande ? 'size-20 text-xl' : 'size-12 text-sm';
  const anillo = { boxShadow: `0 0 0 3px ${ESTADOS[b.estado].color}` };
  return b.avatar_url
    ? <img src={b.avatar_url} alt={b.nombre} className={`${t} rounded-full object-cover shrink-0`} style={anillo} loading="lazy" />
    : <span className={`${t} rounded-full grid place-items-center bg-acento-500 text-white font-bold shrink-0`} style={anillo}>{b.nombre.slice(0, 2).toUpperCase()}</span>;
}

function Ficha({ b, datos, onReservar }: { b: Barbero; datos: NonNullable<ReturnType<typeof useBarberia>['datos']>; onReservar: () => void }) {
  const e = ESTADOS[b.estado];
  const best = datos.barberoServicios.filter((x) => x.barbero_id === b.id && x.es_bestseller)
    .map((x) => datos.servicios.find((s) => s.id === x.servicio_id)).filter(Boolean);
  const hoy = b.horario_atencion[String(isoDow(hoyLima()))];
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4">
        <Avatar b={b} grande />
        <div>
          <p className="titulo text-xl">{b.nombre}</p>
          <p className="text-sm" style={{ color: e.color }}>{e.emoji} {e.texto}</p>
          <p className="text-xs text-base-500 mt-1"><Clock className="inline size-3" /> Hoy: {hoy ? `${hoy[0]} – ${hoy[1]}` : 'no atiende'}</p>
        </div>
      </div>
      {b.bio && <p className="text-sm text-base-500">{b.bio}</p>}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="neu-inset rounded-xl p-3"><p className="text-2xl font-semibold">{b.cola}</p><p className="text-xs text-base-500">en cola ahora</p></div>
        <div className="neu-inset rounded-xl p-3"><p className="text-2xl font-semibold">{b.estado === 'LIBRE' ? '0' : '~' + Math.max(1, Math.round(((b.estado_hasta ? Date.parse(b.estado_hasta) - Date.now() : 0) / 60e3) + b.cola * 30))}</p><p className="text-xs text-base-500">min de espera aprox.</p></div>
      </div>
      {(best.length > 0 || b.especialidades_bestseller.length > 0) && (
        <div>
          <p className="etiqueta">⭐ Especialidades</p>
          <div className="flex flex-wrap gap-1.5">
            {best.map((s) => <span key={s!.id} className="chip">{s!.nombre} · {soles(s!.precio_base)}</span>)}
            {b.especialidades_bestseller.map((t) => <span key={t} className="chip">{t}</span>)}
          </div>
        </div>
      )}
      <button onClick={onReservar} className="btn-acento">📅 Reservar cita</button>
    </div>
  );
}
