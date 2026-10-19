import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Play, UserPlus, X } from 'lucide-react';
import { msg, notificar, subirImagen, supabase, urlComprobante } from '@/lib/supabase';
import { hoyLima, sumarDias } from '@/lib/agenda';
import type { Barberia, Barbero, Cita, Servicio } from '@/lib/tipos';
import { ESTADOS_CITA, soles } from '@/lib/tipos';
import { Aviso, BotonAccion, CampoImagen, Esqueleto, Hoja, Insignia } from './ui';
import { Tarjetas, type Tarjeta } from './ClientesPanel';

const SELECT = '*, clientes(nombre, dni, telefono, estado_verificacion), servicios_cortes(nombre), barberos(nombre)';
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short' });

/** Aviso sonoro corto sin archivos: un "ding" con WebAudio. */
function ding() {
  try {
    const c = new AudioContext();
    [[1318.5, 0], [1568, 0.14]].forEach(([f, t]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(0, c.currentTime + t);
      g.gain.linearRampToValueAtTime(0.3, c.currentTime + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.6);
      o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.6);
    });
  } catch { /* sin audio */ }
}

/** Agenda del día (como la de un POS de barbería). La usan el dueño (todas las
    sillas) y el barbero (`soloBarbero`). Quién valida pagos lo decide `puedeValidar`. */
export default function Agenda({ barberia, barberos, servicios, soloBarbero, puedeValidar }: {
  barberia: Barberia; barberos: Barbero[]; servicios: Servicio[]; soloBarbero?: string; puedeValidar: (c: Cita) => boolean;
}) {
  const [fecha, setFecha] = useState(hoyLima());
  const [citas, setCitas] = useState<Cita[]>([]);
  const [pendientes, setPendientes] = useState<Cita[]>([]);
  const [filtro, setFiltro] = useState(soloBarbero ?? '');
  const [error, setError] = useState('');
  const [comprobante, setComprobante] = useState<{ cita: Cita; url?: string } | null>(null);
  const [completando, setCompletando] = useState<Cita | null>(null);
  const [walkin, setWalkin] = useState(false);
  const [verTodo, setVerTodo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const mia = (c: Cita) => puedeValidar(c) || (!!soloBarbero && c.barbero_id === soloBarbero);

  const cargar = useCallback(async () => {
    const desde = new Date(`${fecha}T00:00:00-05:00`).toISOString();
    const hasta = new Date(`${sumarDias(fecha, 1)}T00:00:00-05:00`).toISOString();
    let q = supabase.from('citas').select(SELECT).eq('barberia_id', barberia.id).gte('fecha_hora', desde).lt('fecha_hora', hasta).order('fecha_hora');
    let p = supabase.from('citas').select(SELECT).eq('barberia_id', barberia.id).eq('estado', 'PENDIENTE_PAGO').order('fecha_hora');
    if (filtro) { q = q.eq('barbero_id', filtro); p = p.eq('barbero_id', filtro); }
    const [a, b] = await Promise.all([q, p]);
    setCitas((a.data ?? []) as Cita[]);
    setCargando(false);
    setPendientes(((b.data ?? []) as Cita[]).filter(mia));
  }, [fecha, filtro, barberia.id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Tiempo real: cualquier cambio en las citas del local refresca; un pago nuevo suena.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const canal = supabase.channel(`citas:${barberia.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas', filter: `barberia_id=eq.${barberia.id}` }, (e) => {
        const c = e.new as Cita;
        if (e.eventType === 'INSERT' && c.estado === 'PENDIENTE_PAGO' && mia(c)) {
          ding();
          if ('Notification' in window && Notification.permission === 'granted') new Notification('💈 Nueva cita por validar', { body: 'Un cliente espera tu confirmación.' });
        }
        cargar();
      }).subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [barberia.id, cargar]);

  async function rpc(nombre: string, args: Record<string, unknown>) {
    setError('');
    const { error } = await supabase.rpc(nombre, args);
    if (error) setError(msg(error)); else cargar();
  }
  async function verComprobante(c: Cita) {
    setComprobante({ cita: c });
    setComprobante({ cita: c, url: c.comprobante_pago_url ? await urlComprobante(c.comprobante_pago_url) : undefined });
  }

  const vivas = citas.filter((c) => !['CANCELADA', 'RECHAZADA'].includes(c.estado));
  const orden: Record<string, number> = { EN_CURSO: 0, EN_COLA: 1, PENDIENTE_PAGO: 2, CONFIRMADA: 3 };
  const visibles = (verTodo ? citas : citas.filter((c) => c.estado in orden))
    .slice().sort((a, b) => (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9) || a.fecha_hora.localeCompare(b.fecha_hora));
  const cobrado = citas.filter((c) => c.estado === 'COMPLETADA').reduce((n, c) => n + Number(c.precio), 0);

  const Fila = ({ c, conFecha }: { c: Cita; conFecha?: boolean }) => {
    const e = ESTADOS_CITA[c.estado];
    return (
      <li className="neu-sm rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-16 tabular-nums text-sm font-semibold">{conFecha && <span className="block text-[10px] font-normal text-base-500">{dia(c.fecha_hora)}</span>}{hora(c.fecha_hora)}</span>
        <span className="flex-1 min-w-44">
          <span className="block text-sm font-medium">
            {c.tipo === 'WALKIN' ? `🚶 ${c.nombre_walkin || 'Sin cita'}` : c.clientes?.nombre || 'Cliente'}
            {c.clientes && <span className="ml-2 align-middle"><Insignia verificado={c.clientes.estado_verificacion === 'VERIFIED_100'} /></span>}
          </span>
          <span className="block text-xs text-base-500">
            {c.servicios_cortes?.nombre ?? 'Servicio'} · {!soloBarbero && `${c.barberos?.nombre} · `}{soles(c.precio)}
            {c.clientes?.dni && ` · DNI ${c.clientes.dni}`}{c.clientes?.telefono && <> · <a className="text-acento-500" href={`https://wa.me/51${c.clientes.telefono.replace(/\D/g, '').slice(-9)}`} target="_blank" rel="noopener">WhatsApp</a></>}
          </span>
        </span>
        <span className={`text-xs font-medium ${e.clase}`}>{c.estado === 'PENDIENTE_PAGO' && !c.comprobante_pago_url ? 'Sin adelanto · pide confirmación' : e.texto}</span>
        <span className="flex gap-1.5 flex-wrap">
          {c.estado === 'PENDIENTE_PAGO' && mia(c) && (c.comprobante_pago_url
            ? <button className="btn !py-1 text-xs" onClick={() => verComprobante(c)}>🧾 Revisar pago</button>
            : <button className="btn-acento !py-1 text-xs" onClick={() => rpc('confirmar_cita_conocido', { p_cita: c.id })}><Check className="size-3" /> Lo conozco · confirmar</button>)}
          {(c.estado === 'CONFIRMADA' || c.estado === 'EN_COLA') && <>
            <BotonAccion className="btn !py-1 text-xs" onClick={() => rpc('iniciar_cita', { p_cita: c.id })}><Play className="size-3" /> Iniciar</BotonAccion>
            <BotonAccion className="btn !py-1 text-xs" onClick={() => rpc('marcar_no_asistio', { p_cita: c.id })}>No vino</BotonAccion>
          </>}
          {c.estado === 'EN_CURSO' && <button className="btn-acento !py-1 text-xs" onClick={() => setCompletando(c)}><Check className="size-3" /> Completar</button>}
          {['PENDIENTE_PAGO', 'CONFIRMADA', 'EN_COLA'].includes(c.estado) &&
            <button className="btn !py-1 !px-2 text-xs text-red-500" aria-label="Cancelar cita" onClick={() => confirm('¿Cancelar la cita?') && rpc('cancelar_cita', { p_cita: c.id })}><X className="size-3" /></button>}
        </span>
      </li>
    );
  };

  return (
    <div className="grid gap-4">
      {pendientes.length > 0 && (
        <section className="neu rounded-2xl p-4 ring-2 ring-amber-500/50">
          <h3 className="titulo text-sm mb-2">🧾 Citas por validar ({pendientes.length})</h3>
          <ul className="grid gap-2">{pendientes.map((c) => <Fila key={c.id} c={c} conFecha />)}</ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn !p-2" aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}><ChevronLeft className="size-4" /></button>
        <input type="date" className="campo !w-auto" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <button className="btn !p-2" aria-label="Día siguiente" onClick={() => setFecha(sumarDias(fecha, 1))}><ChevronRight className="size-4" /></button>
        <button className="btn !py-2 text-xs" onClick={() => setFecha(hoyLima())}>Hoy</button>
        {!soloBarbero && (
          <select className="campo !w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por barbero">
            <option value="">Todos los barberos</option>
            {barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        )}
        <button className="btn !py-2 text-xs ml-auto" onClick={() => setVerTodo((v) => !v)} aria-pressed={verTodo}>
          {verTodo ? 'Ver solo activas' : 'Ver todas'}
        </button>
        <button className="btn-acento" onClick={() => setWalkin(true)}><UserPlus className="size-4" /> Walk-in</button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="neu-inset rounded-xl p-2"><p className="text-base font-semibold tabular-nums sm:text-xl">{vivas.length}</p><p className="text-[11px] text-base-500">citas</p></div>
        <div className="neu-inset rounded-xl p-2"><p className="text-base font-semibold tabular-nums sm:text-xl">{citas.filter((c) => c.estado === 'COMPLETADA').length}</p><p className="text-[11px] text-base-500">atendidos</p></div>
        <div className="neu-inset rounded-xl p-2"><p className="text-base font-semibold tabular-nums sm:text-xl">{soles(cobrado)}</p><p className="text-[11px] text-base-500">facturado</p></div>
      </div>
      {error && <Aviso>{error}</Aviso>}
      <ul className="grid gap-2">
        {cargando && [0, 1, 2].map((i) => <Esqueleto key={i} className="h-16" />)}
        {!cargando && visibles.map((c) => <Fila key={c.id} c={c} />)}
        {!cargando && visibles.length === 0 &&<p className="text-sm text-base-400 text-center py-8">{verTodo ? 'Sin citas este día.' : 'No hay citas pendientes ni en cola.'}</p>}
      </ul>

      <Hoja abierta={!!comprobante} onClose={() => setComprobante(null)} titulo="Comprobante de pago">
        {comprobante && (
          <div className="grid gap-3">
            <p className="text-sm">{comprobante.cita.clientes?.nombre} · DNI {comprobante.cita.clientes?.dni} · <b>{soles(comprobante.cita.precio)}</b> por {comprobante.cita.metodo_pago}</p>
            {comprobante.url ? <img src={comprobante.url} alt="Captura del pago" className="rounded-xl max-h-[55vh] mx-auto" /> : <p className="text-sm text-base-400">Cargando imagen…</p>}
            <p className="text-xs text-base-500">Confirma en tu app de Yape/Plin que el abono llegó antes de aprobar. Al aprobar, el cliente queda 100% verificado.</p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn text-red-500" onClick={() => { rpc('revisar_pago', { p_cita: comprobante.cita.id, p_aprobar: false }); setComprobante(null); }}>Rechazar</button>
              <button className="btn-acento" onClick={() => { rpc('revisar_pago', { p_cita: comprobante.cita.id, p_aprobar: true }); notificar('cita_confirmada', comprobante.cita.id); setComprobante(null); }}>✅ Aprobar</button>
            </div>
          </div>
        )}
      </Hoja>

      <Hoja abierta={!!completando} onClose={() => setCompletando(null)} titulo="Completar atención">
        {completando && <Completar cita={completando} barberiaId={barberia.id} onListo={() => { setCompletando(null); cargar(); }} />}
      </Hoja>

      <Hoja abierta={walkin} onClose={() => setWalkin(false)} titulo="Cliente sin cita (walk-in)">
        <Walkin barberiaId={barberia.id} barberos={soloBarbero ? barberos.filter((b) => b.id === soloBarbero) : barberos.filter((b) => b.activo)} servicios={servicios}
          onListo={() => { setWalkin(false); cargar(); }} />
      </Hoja>
    </div>
  );
}

function Completar({ cita, barberiaId, onListo }: { cita: Cita; barberiaId: string; onListo: () => void }) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const yaPagado = cita.verificado_pago;
  const [tarjetas, setTarjetas] = useState<Tarjeta[] | null>(null);
  if (tarjetas) return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold">Corte completado. Cartilla de {cita.clientes?.nombre || cita.nombre_walkin || 'el cliente'}:</p>
      <Tarjetas tarjetas={tarjetas} />
      <button className="btn-acento" onClick={onListo}>Listo</button>
    </div>
  );
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true); setError('');
    try {
      const foto = f.get('foto') as File;
      const url = foto?.size ? (await subirImagen('publico', `${barberiaId}/cortes`, foto)).url : null;
      const { error } = await supabase.rpc('completar_cita', {
        p_cita: cita.id, p_metodo: f.get('metodo'), p_monto: Number(f.get('monto')), p_foto: url,
      });
      if (error) throw error;
      const { data } = await supabase.rpc('tarjetas_cliente', { p_cliente: cita.cliente_id, p_barberia: barberiaId });
      setTarjetas((data ?? []) as Tarjeta[]);
    } catch (e) { setError(msg(e)); } finally { setEnviando(false); }
  }
  return (
    <form onSubmit={enviar} className="grid gap-3">
      {yaPagado && <Aviso tipo="ok">Pago adelantado ya validado ({soles(cita.precio)}).</Aviso>}
      <label><span className="etiqueta">Método de pago</span>
        <select name="metodo" className="campo" defaultValue={cita.metodo_pago ?? 'EFECTIVO'}>
          <option value="EFECTIVO">Efectivo</option><option value="YAPE">Yape</option><option value="PLIN">Plin</option><option value="TRANSFERENCIA">Transferencia</option>
        </select></label>
      <label><span className="etiqueta">Monto cobrado (S/)</span>
        <input name="monto" type="number" step="0.5" min="0" required defaultValue={cita.precio} className="campo" /></label>
      <div className="grid gap-1.5">
        <span className="etiqueta">📸 Foto del corte (aparece en el historial del cliente)</span>
        <CampoImagen name="foto" texto="Tomar o subir foto del corte" />
      </div>
      {error && <Aviso>{error}</Aviso>}
      <button disabled={enviando} className="btn-acento">{enviando ? 'Guardando…' : 'Terminar y liberar silla'}</button>
    </form>
  );
}

function Walkin({ barberiaId, barberos, servicios, onListo }: { barberiaId: string; barberos: Barbero[]; servicios: Servicio[]; onListo: () => void }) {
  const [error, setError] = useState('');
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [tipo, setTipo] = useState<'DNI' | 'CE' | 'PASAPORTE'>('DNI');
  const [anonimo, setAnonimo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [frecuentes, setFrecuentes] = useState<{ nombre: string; dni: string | null }[]>([]);

  useEffect(() => {
    supabase.from('citas').select('nombre_walkin, clientes(nombre, dni)').eq('barberia_id', barberiaId)
      .order('fecha_hora', { ascending: false }).limit(300)
      .then(({ data }) => {
        const cuenta = new Map<string, { nombre: string; dni: string | null; n: number }>();
        for (const c of (data ?? []) as { nombre_walkin: string | null; clientes: { nombre: string | null; dni: string | null } | null }[]) {
          const nom = c.clientes?.nombre || c.nombre_walkin;
          if (!nom) continue;
          const clave = c.clientes?.dni || nom.toLowerCase();
          cuenta.set(clave, { nombre: nom, dni: c.clientes?.dni ?? null, n: (cuenta.get(clave)?.n ?? 0) + 1 });
        }
        setFrecuentes([...cuenta.values()].sort((a, b) => b.n - a.n).slice(0, 8));
      });
  }, [barberiaId]);

  const [historial, setHistorial] = useState<{ servicio: string; fecha: string; barbero: string }[] | null>(null);
  useEffect(() => {
    setHistorial(null);
    const valido = tipo === 'DNI' ? dni.length === 8 : dni.length >= 6;
    if (!valido) return;
    let vivo = true;
    (async () => {
      const { data: encontrados } = await supabase.rpc('buscar_cliente_dni', { p_dni: dni });
      const id = (encontrados as { id: string }[] | null)?.[0]?.id;
      if (!id) { if (vivo) setHistorial([]); return; }
      const { data } = await supabase.from('citas').select('fecha_hora, servicios_cortes(nombre), barberos(nombre)')
        .eq('barberia_id', barberiaId).eq('cliente_id', id).eq('estado', 'COMPLETADA')
        .order('fecha_hora', { ascending: false }).limit(50);
      if (!vivo) return;
      setHistorial(((data ?? []) as unknown as { fecha_hora: string; servicios_cortes: { nombre: string } | null; barberos: { nombre: string } | null }[])
        .map((c) => ({ servicio: c.servicios_cortes?.nombre ?? 'Corte', fecha: c.fecha_hora, barbero: c.barberos?.nombre ?? '' })));
    })();
    return () => { vivo = false; };
  }, [dni, tipo, barberiaId]);

  async function buscarDni() {
    setError(''); setBuscando(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const r = await fetch(`/api/dni/${dni}`, { headers: { Authorization: `Bearer ${token}` } }).then((x) => x.json()).catch(() => null);
    setBuscando(false);
    if (!r || r.error) return setError(r?.error || 'No se pudo consultar. Escribe el nombre a mano.');
    if (!r.encontrado) return setError('DNI no encontrado. Escribe el nombre a mano.');
    setNombre(`${r.nombres} ${r.apellidos}`.trim());
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc('agregar_walkin', {
      p_barbero: f.get('barbero'), p_nombre: anonimo ? 'Anónimo' : nombre.trim(),
      p_dni: anonimo ? null : dni.trim(), p_servicio: f.get('servicio') || null, p_tipo: tipo,
    });
    if (error) setError(msg(error)); else onListo();
  }
  return (
    <form onSubmit={enviar} className="grid gap-3">
      {frecuentes.length > 0 && (
        <div className="grid gap-1.5">
          <span className="etiqueta">Clientes frecuentes</span>
          <div className="flex flex-wrap gap-1.5">
            {frecuentes.map((c) => (
              <button type="button" key={c.dni ?? c.nombre} onClick={() => { setNombre(c.nombre); setDni(c.dni ?? ''); }}
                className="chip min-h-9 !px-3 !text-sm">{c.nombre}</button>
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-1.5">
        <button type="button" aria-pressed={anonimo} onClick={() => setAnonimo(!anonimo)} className="chip min-h-10 w-fit !px-3 !text-sm aria-pressed:bg-acento-500 aria-pressed:text-black">{anonimo ? "✓ Corte anónimo: no se registra el cliente" : "Cliente sin registrar (anónimo)"}</button>
        <span className="etiqueta">{anonimo ? "Sin documento" : "Documento (obligatorio: con él se suman los cortes)"}</span>
        <div className="flex gap-2">
          <select value={tipo} onChange={(e) => { setTipo(e.target.value as typeof tipo); setDni(''); }} className="campo !w-auto" aria-label="Tipo de documento" disabled={anonimo}>
            <option value="DNI">DNI</option>
            <option value="CE">Carné de extranjería</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
          <input value={dni} onChange={(e) => setDni(tipo === 'DNI' ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase())}
            inputMode={tipo === 'DNI' ? 'numeric' : 'text'} placeholder={tipo === 'DNI' ? '8 dígitos' : 'Número de documento'} required={!anonimo} disabled={anonimo} className="campo" />
          {tipo === 'DNI' && <button type="button" className="btn shrink-0" disabled={dni.length !== 8 || buscando} onClick={buscarDni}>{buscando ? '…' : 'Buscar'}</button>}
        </div>
      </div>
      {historial && (
        <div className="panel grid gap-2 text-sm">
          {historial.length === 0 ? <p>Cliente nuevo o sin cortes previos en el local.</p> : (() => {
            const conteo = new Map<string, number>();
            historial.forEach((h) => conteo.set(h.servicio, (conteo.get(h.servicio) ?? 0) + 1));
            const [top, veces] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
            return (
              <>
                <p><b>Lo de siempre:</b> {top} <span className="text-[var(--texto-suave)]">({veces} de {historial.length} cortes)</span></p>
                <ul className="grid gap-1 text-xs text-[var(--texto-suave)]">
                  {historial.slice(0, 3).map((h) => (
                    <li key={h.fecha}>{new Date(h.fecha).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short' })} · {h.servicio} · con {h.barbero}</li>
                  ))}
                </ul>
              </>
            );
          })()}
        </div>
      )}
      <label><span className="etiqueta">Nombre y apellidos</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required={!anonimo} disabled={anonimo} className="campo" /></label>
      <label><span className="etiqueta">Barbero</span>
        <select name="barbero" className="campo">{barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre} {b.cola ? `(cola ${b.cola})` : ''}</option>)}</select></label>
      <label><span className="etiqueta">Servicio</span>
        <select name="servicio" className="campo">{servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {soles(s.precio_base)}</option>)}</select></label>
      {error && <Aviso>{error}</Aviso>}
      <button className="btn-acento">Agregar a la cola</button>
    </form>
  );
}
