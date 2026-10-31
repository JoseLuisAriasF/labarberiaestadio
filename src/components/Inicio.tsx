import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarCheck, Clock, Scissors, Sparkles, Star, Users, X } from 'lucide-react';
import { codigoActual, slugActual, supabase } from '@/lib/supabase';
import { useBarberia } from '@/lib/useBarberia';
import { abiertoAhora, hoyLima, isoDow, sumarDias } from '@/lib/agenda';
import type { Barbero } from '@/lib/tipos';
import { ESTADOS, soles } from '@/lib/tipos';
import { temaActivo } from '@/lib/festivo';
import EfectoFestivo from './EfectoFestivo';
import Reserva, { guardarBorrador, leerBorrador } from './Reserva';
import { Aviso, Cargando, Esqueleto, Hoja } from './ui';
import { GuiaReserva, type EstadoGuia } from './GuiaReserva';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });

// Three.js pesa: se baja aparte, sin frenar el primer pintado de la página.
const Barberia3D = lazy(() => import('./three/Barberia3D'));

type Vista = 'lista' | 'mapa';
type Disp = { en_cola: number; minutos_cola: number };

function estadoLinea(b: Barbero, d?: Disp) {
  if (!b.presente) return 'Fuera del local por ahora';
  const espera = d && d.en_cola > 0 ? ` · ${d.en_cola} en cola, unos ${d.minutos_cola} min` : '';
  if (b.estado === 'LIBRE') return `Libre${espera}`;
  if (b.estado === 'DESCANSO') return `En descanso${b.estado_hasta ? `, vuelve ${hora(b.estado_hasta)}` : ''}`;
  return `Ocupado${b.estado_hasta ? `, libre aprox. ${hora(b.estado_hasta)}` : ''}${espera}`;
}

export default function Inicio() {
  const slug = useMemo(slugActual, []);
  const codigo = useMemo(codigoActual, []);
  const { datos, error, enVivo } = useBarberia(slug ? { slug } : { codigo });
  const [pisoId, setPisoId] = useState<string | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [reservando, setReservando] = useState(false);
  const [buscaCorte, setBuscaCorte] = useState('');
  const [corteId, setCorteId] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('lista');
  const [guia, setGuia] = useState<EstadoGuia>('no');
  // Abrir un barbero también enciende la guía, salvo que el cliente la haya ocultado.
  useEffect(() => { if (fichaId) setGuia((g) => (g === 'no' ? 'si' : g)); }, [fichaId]);

  useEffect(() => {
    const b = leerBorrador();
    if (datos && b && datos.barberos.some((x) => x.id === b.barberoId)) { setFichaId(b.barberoId); setReservando(true); }
  }, [!!datos]);

  const [disp, setDisp] = useState<Record<string, Disp>>({});
  useEffect(() => {
    if (!datos) return;
    supabase.rpc('disponibilidad_barberos', { p_barberia: datos.barberia.id }).then(({ data }) =>
      setDisp(Object.fromEntries(((data ?? []) as (Disp & { barbero_id: string })[]).map((d) => [d.barbero_id, d]))));
  }, [datos?.barberia.id, datos?.barberos]);

  if (error) return (
    <div className="panel mx-auto grid max-w-md gap-4 py-10 text-center">
      <p className="titulo text-3xl">Esta barbería no está disponible</p>
      <p className="text-sm text-[var(--texto-suave)]">Revisa el enlace o escríbele al local directamente.</p>
      <a href="/registro" className="btn-primario">Registra tu barbería</a>
    </div>
  );
  if (!datos) return <EsqueletoInicio />;

  const { barberia, pisos, sillas, barberos } = datos;
  const pisoActual = pisoId ?? pisos[0]?.id ?? null;
  const ficha = barberos.find((b) => b.id === fichaId) ?? null;
  const delPiso = sillas.filter((s) => s.piso_id === pisoActual);
  const activos = barberos.filter((b) => b.activo);
  const libres = activos.filter((b) => b.presente && b.estado === 'LIBRE').length;
  const enCola = activos.reduce((n, b) => n + b.cola, 0);
  const abierto = abiertoAhora(barberia.horario);
  const cortesCoinciden = buscaCorte.trim().length < 2 ? []
    : datos.servicios.filter((s) => s.nombre.toLowerCase().includes(buscaCorte.trim().toLowerCase())).slice(0, 6);
  const corte = datos.servicios.find((s) => s.id === corteId) ?? null;
  const quienLoHace = corte
    ? datos.barberoServicios.filter((x) => x.servicio_id === corte.id)
        .map((x) => ({ b: barberos.find((b) => b.id === x.barbero_id), best: x.es_bestseller }))
        .filter((x): x is { b: Barbero; best: boolean } => !!x.b && x.b.activo)
        .sort((x, y) => Number(y.best) - Number(x.best) || Number(!!y.b.presente) - Number(!!x.b.presente))
    : [];
  const pisoDe = (b: Barbero) => pisos.find((p) => p.id === sillas.find((s) => s.barbero_id === b.id)?.piso_id);
  const festivo = temaActivo(barberia.tema_festivo);

  return (
    <div className={`grid gap-8 ${guia === 'si' ? 'pb-48 sm:pb-10' : 'pb-10'}`}>
      <EfectoFestivo tema={festivo} />
      <section className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-3">
          <p className="inline-flex w-fit items-center gap-2 text-sm font-medium">
            <span className={`size-2.5 rounded-full ${enVivo ? 'bg-red-500 animate-pulse' : 'bg-base-400'}`} />
            <span className={enVivo ? 'text-red-400' : 'text-base-400'}>{enVivo ? 'En vivo' : 'Conectando…'}</span>
            <span className="text-base-400">·</span>
            <span className={abierto ? 'text-emerald-400' : 'text-base-400'}>{abierto ? 'Abierto ahora' : 'Cerrado ahora'}</span>
          </p>
          {festivo && (
            <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: `${festivo.color}26`, border: `1px solid ${festivo.color}66`, color: festivo.color }}>
              {festivo.saludo}
            </span>
          )}
          <h1 className="titulo text-3xl sm:text-5xl leading-tight">{barberia.nombre}</h1>
          <p className="text-base text-[var(--texto-suave)] max-w-prose">
            Reserva tu corte en segundos. Mira qué barbero está libre y llega cuando te toque.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a href="#barberos" onClick={() => setGuia('si')} className="btn-primario" data-guia="reservar">
              <CalendarCheck className="size-5" /> Reservar ahora
            </a>
            <a href="#barberos" onClick={() => setGuia('si')} className="btn min-h-12 px-4">¿Cómo reservo?</a>
          </div>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <span className="stat-pill flex-1 justify-center">
            <Sparkles className="size-4 text-emerald-400" /> <b className="text-base">{libres}</b> libres
          </span>
          <span className="stat-pill flex-1 justify-center">
            <Users className="size-4 text-acento-400" /> <b className="text-base">{enCola}</b> en cola
          </span>
        </div>
      </section>

      <section aria-label="Cómo funciona" data-guia="pasos" className="panel grid gap-4 sm:grid-cols-3">
        {[
          { i: Scissors, t: 'Elige tu corte', d: 'Mira precios y tiempos.' },
          { i: Clock, t: 'Escoge día y hora', d: 'Solo verás horas libres.' },
          { i: Star, t: 'Confirma', d: 'Primera vez: pago por Yape o Plin. Si ya te conocemos, sin pago.' },
        ].map((p, n) => (
          <div key={p.t} className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-acento-500/15 text-acento-300 text-sm font-bold">{n + 1}</span>
            <span>
              <span className="block font-semibold">{p.t}</span>
              <span className="block text-sm text-[var(--texto-suave)]">{p.d}</span>
            </span>
          </div>
        ))}
      </section>

      <section aria-label="Busca tu corte" className="panel grid gap-4">
        <div>
          <h2 className="titulo text-2xl">¿Qué corte quieres?</h2>
          <p className="text-sm text-[var(--texto-suave)]">Escribe el nombre y te mostramos quién lo hace mejor.</p>
        </div>
        <input value={buscaCorte} onChange={(e) => { setBuscaCorte(e.target.value); setCorteId(null); }}
          placeholder="Ej. fade, barba, modcut" aria-label="Buscar corte" className="campo" />
        {cortesCoinciden.length > 0 && !corte && (
          <div className="flex flex-wrap gap-2">
            {cortesCoinciden.map((s) => (
              <button key={s.id} type="button" className="chip min-h-10 !px-3 !text-sm" onClick={() => { setCorteId(s.id); setBuscaCorte(s.nombre); }}>{s.nombre}</button>
            ))}
          </div>
        )}
        {corte && (
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            {corte.foto_url
              ? <img src={corte.foto_url} alt={corte.nombre} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
              : <div className="grid aspect-square place-items-center rounded-xl bg-[var(--superficie)] text-4xl">✂️</div>}
            <div className="grid content-start gap-3">
              <div>
                <p className="titulo text-2xl">{corte.nombre}</p>
                <p className="text-sm text-[var(--texto-suave)]">{corte.duracion_min} min · {soles(corte.precio_base)}</p>
                {corte.descripcion && <p className="mt-1 text-sm">{corte.descripcion}</p>}
              </div>
              <p className="etiqueta">Lo hacen en el local</p>
              {quienLoHace.length === 0 ? (
                <p className="text-sm">Ningún barbero tiene este corte todavía. Pregunta en el local.</p>
              ) : (
                <ul className="grid gap-2">
                  {quienLoHace.map(({ b, best }) => (
                    <li key={b.id}>
                      <button type="button" className="opcion w-full"
                        onClick={() => { guardarBorrador({ barberoId: b.id, servicioId: corte.id }); setFichaId(b.id); setReservando(true); }}>
                        <Avatar b={b} />
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate font-semibold">{b.nombre} {best && <span className="chip ml-1">⭐ Especialidad</span>}</span>
                          <span className="block text-xs text-[var(--texto-suave)]">
                            {!b.presente ? 'Fuera del local por ahora' : b.estado === 'LIBRE' ? 'Libre ahora' : 'Atendiendo'}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-acento-400">Reservar →</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="w-fit text-sm text-[var(--texto-suave)] underline" onClick={() => { setCorteId(null); setBuscaCorte(''); }}>Buscar otro corte</button>
            </div>
          </div>
        )}
      </section>

      <section id="barberos" data-guia="barberos" aria-labelledby="titulo-barberos" className="grid gap-4 scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="titulo-barberos" className="titulo text-2xl">Elige a tu barbero</h2>
          <div role="tablist" aria-label="Forma de ver" data-guia="vista" className="panel !p-1 flex gap-1">
            {([['lista', 'Lista'], ['mapa', 'Mapa 3D']] as const).map(([v, t]) => (
              <button key={v} role="tab" aria-selected={vista === v} onClick={() => setVista(v)}
                className={`min-h-10 rounded-lg px-4 text-sm font-bold transition-colors ${vista === v ? 'bg-acento-500 text-black' : 'text-[var(--texto-suave)] hover:text-[var(--texto)]'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {pisos.length > 1 && (
          <div role="tablist" aria-label="Pisos" className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
            {pisos.map((p) => (
              <button key={p.id} role="tab" aria-selected={p.id === pisoActual} onClick={() => setPisoId(p.id)}
                className={`min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${p.id === pisoActual ? 'border-acento-500 bg-acento-500/10 text-acento-300' : 'border-[var(--borde)] text-[var(--texto-suave)]'}`}>
                {p.nombre || `Piso ${p.numero_piso}`}
              </button>
            ))}
          </div>
        )}

        {vista === 'mapa' && (
          <div className="grid gap-2">
            <Suspense fallback={<div className="h-[56vh] min-h-[340px] rounded-2xl panel grid place-items-center"><Cargando texto="Montando el local en 3D…" /></div>}>
              <Barberia3D sillas={delPiso} barberos={barberos} seleccionId={fichaId} onSelect={(b) => setFichaId(b.id)}
                alto="h-[56vh] min-h-[340px] lg:h-[66vh]" />
            </Suspense>
            <p className="text-xs text-[var(--texto-suave)]">Toca una silla para ver al barbero y reservar.</p>
          </div>
        )}

        {vista === 'lista' && (
          <ul className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${guia === 'si' ? 'guia-foco' : ''}`}>
            {activos.map((b) => {
              const e = ESTADOS[b.estado];
              return (
                <li key={b.id}>
                  <button onClick={() => setFichaId(b.id)}
                    className="neu w-full p-4 flex items-center gap-4 text-left transition-colors hover:border-acento-500/60 neu-press">
                    <Avatar b={b} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-base truncate">{b.nombre}</span>
                      <span className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: e.color }}>
                        {e.emoji} {estadoLinea(b, disp[b.id])}
                      </span>
                      {pisos.length > 1 && pisoDe(b) && (
                        <span className="block text-xs text-[var(--texto-suave)]">{pisoDe(b)!.nombre || `Piso ${pisoDe(b)!.numero_piso}`}</span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1 shrink-0">
                      {b.cola > 0 && <span className="chip">👥 {b.cola} en cola</span>}
                      <span className="text-sm font-semibold text-acento-400">Reservar →</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {activos.length === 0 && <li className="sm:col-span-2 lg:col-span-3"><Aviso tipo="info">Aún no hay barberos registrados.</Aviso></li>}
          </ul>
        )}
      </section>

      {guia === 'si' ? (
        !ficha && (
          <GuiaReserva paso={1} onOcultar={() => setGuia('oculta')}
            texto={vista === 'mapa' ? 'Toca una silla del mapa para ver a ese barbero.' : 'Toca a un barbero de la lista. 🟢 significa que está libre ahora.'}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[22rem]" />
        )
      ) : (
        <a href="#barberos" onClick={() => setGuia('si')} className="btn-primario fixed inset-x-4 z-40 shadow-lg sm:hidden" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <CalendarCheck className="size-5" /> Reservar ahora
        </a>
      )}

      <Hoja abierta={!!ficha} onClose={() => { setFichaId(null); setReservando(false); }} titulo={reservando ? `Reservar con ${ficha?.nombre}` : 'Barbero'}>
        {ficha && (reservando
          ? <Reserva datos={datos} barbero={ficha} guia={guia} setGuia={setGuia} onListo={() => { setReservando(false); setFichaId(null); setGuia('no'); }} />
          : (
            <div className="grid gap-5">
              {guia === 'si' && <GuiaReserva paso={1} onOcultar={() => setGuia('oculta')}
                texto={`Aquí ves si ${ficha.nombre.split(' ')[0]} está libre. Si te gusta, toca el botón dorado «Reservar» de abajo.`} />}
              <Ficha b={ficha} datos={datos} disp={disp[ficha.id]} foco={guia === 'si'} onReservar={() => setReservando(true)} />
            </div>
          ))}
      </Hoja>
    </div>
  );
}

function EsqueletoInicio() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando la barbería">
      <div className="grid gap-3">
        <Esqueleto className="h-4 w-40" />
        <Esqueleto className="h-12 w-3/4" />
        <Esqueleto className="h-4 w-full" />
        <Esqueleto className="h-12 w-44" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-16" />)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-20" />)}</div>
    </div>
  );
}

function Avatar({ b, grande }: { b: Barbero; grande?: boolean }) {
  const t = grande ? 'size-20 text-xl' : 'size-14 text-base';
  const anillo = { boxShadow: `0 0 0 3px ${ESTADOS[b.estado].color}` };
  return b.avatar_url
    ? <img src={b.avatar_url} alt={b.nombre} className={`${t} rounded-full object-cover shrink-0`} style={anillo} loading="lazy" />
    : <span className={`${t} rounded-full grid place-items-center bg-acento-500 text-white font-bold shrink-0`} style={anillo}>{b.nombre.slice(0, 2).toUpperCase()}</span>;
}

/** Foto del barbero en grande. Se monta en <body> para no quedar atrapada por la animación de la hoja. */
function VisorFoto({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Foto de ${alt}`} onClick={onClose}
      className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} className="max-h-[90dvh] max-w-full rounded-2xl object-contain shadow-2xl" />
      <button type="button" onClick={onClose} aria-label="Cerrar foto"
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
        <X className="size-5" />
      </button>
    </div>,
    document.body,
  );
}

function Ficha({ b, datos, disp, foco, onReservar }: { b: Barbero; datos: NonNullable<ReturnType<typeof useBarberia>['datos']>; disp?: Disp; foco?: boolean; onReservar: () => void }) {
  const e = ESTADOS[b.estado];
  const [verFoto, setVerFoto] = useState(false);
  const best = datos.barberoServicios.filter((x) => x.barbero_id === b.id && x.es_bestseller)
    .map((x) => datos.servicios.find((s) => s.id === x.servicio_id)).filter(Boolean);
  const hoy = b.horario_atencion[String(isoDow(hoyLima()))];
  const [ocupados, setOcupados] = useState<{ inicio: string; fin: string }[] | null>(null);
  useEffect(() => {
    const dia = hoyLima();
    supabase.rpc('horarios_ocupados', {
      p_barbero: b.id,
      p_desde: new Date(`${dia}T00:00:00-05:00`).toISOString(),
      p_hasta: new Date(`${sumarDias(dia, 1)}T00:00:00-05:00`).toISOString(),
    }).then(({ data }) => setOcupados(data ?? []));
  }, [b.id]);
  const ahora = Date.now();
  const pendientes = (ocupados ?? []).filter((o) => Date.parse(o.fin) > ahora);
  const libreA = b.estado !== 'LIBRE' && b.estado_hasta ? hora(b.estado_hasta) : null;
  const estadoTexto = !b.presente ? 'Fuera del local por ahora' : b.estado === 'LIBRE'
    ? (pendientes[0] ? `Libre ahora. Próxima cita a las ${hora(pendientes[0].inicio)}` : 'Libre ahora. No tiene citas hoy')
    : b.estado === 'DESCANSO'
      ? (libreA ? `En descanso. Vuelve aprox. a las ${libreA}` : 'En descanso')
      : (libreA ? `Atendiendo. Libre aprox. a las ${libreA}` : 'Atendiendo ahora');
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        {b.avatar_url ? (
          <button type="button" onClick={() => setVerFoto(true)} aria-label={`Ver foto de ${b.nombre} en grande`}
            className="shrink-0 rounded-full transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-acento-500">
            <Avatar b={b} grande />
          </button>
        ) : <Avatar b={b} grande />}
        {verFoto && b.avatar_url && <VisorFoto src={b.avatar_url} alt={b.nombre} onClose={() => setVerFoto(false)} />}
        <div className="min-w-0">
          <p className="titulo text-xl">{b.nombre}</p>
          <p className="text-sm font-medium" style={{ color: e.color }}>{e.emoji} {e.texto}</p>
          <p className="text-xs text-[var(--texto-suave)] mt-1 flex items-center gap-1"><Clock className="size-3" /> Hoy: {hoy ? `${hoy[0]} – ${hoy[1]}` : 'no atiende'}</p>
        </div>
      </div>
      {b.bio && <p className="text-sm text-[var(--texto-suave)]">{b.bio}</p>}
      <div className="panel grid gap-3">
        <p className="text-base font-semibold">{estadoTexto}</p>
        {disp && disp.en_cola > 0 && <p className="text-sm text-[var(--texto-suave)]">Hay {disp.en_cola} {disp.en_cola === 1 ? 'persona' : 'personas'} en cola: unos {disp.minutos_cola} min de espera si vienes ahora.</p>}
        <div className="grid gap-2">
          <p className="etiqueta !mb-0">Horas ocupadas hoy</p>
          {ocupados === null ? <p className="text-sm text-[var(--texto-suave)]">Cargando…</p>
            : pendientes.length === 0 ? <p className="text-sm text-[var(--texto-suave)]">Sin citas por delante hoy. Puedes venir dentro del horario.</p>
            : <div className="flex flex-wrap gap-1.5">{pendientes.map((o) => <span key={o.inicio} className="chip">{hora(o.inicio)} – {hora(o.fin)}</span>)}</div>}
        </div>
      </div>
      {(best.length > 0 || b.especialidades_bestseller.length > 0) && (
        <div className="grid gap-2">
          <p className="etiqueta">Especialidades</p>
          <div className="flex flex-wrap gap-1.5">
            {best.map((s) => <span key={s!.id} className="chip">⭐ {s!.nombre} · {soles(s!.precio_base)}</span>)}
            {b.especialidades_bestseller.map((t) => <span key={t} className="chip">{t}</span>)}
          </div>
        </div>
      )}
      <button onClick={onReservar} className={`btn-primario w-full ${foco ? 'guia-foco' : ''}`}>
        <CalendarCheck className="size-5" /> Reservar con {b.nombre.split(' ')[0]}
      </button>
    </div>
  );
}
