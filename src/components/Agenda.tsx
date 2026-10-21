import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Play, UserPlus, X } from 'lucide-react';
import { msg, notificar, subirImagen, supabase, urlComprobante } from '@/lib/supabase';
import { hoyLima, sumarDias } from '@/lib/agenda';
import { consultarDni } from '@/lib/dni';
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
    // La barra de color lee el estado de un vistazo, sin leer el texto.
    const barra = { PENDIENTE_PAGO: 'border-amber-500', CONFIRMADA: 'border-acento-500', EN_COLA: 'border-sky-500', EN_CURSO: 'border-emerald-500' }[c.estado as string] ?? 'border-base-700';
    return (
      <li className={`neu-sm rounded-xl border-l-4 ${barra} px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2`}>
        <span className="w-16 tabular-nums text-base font-bold">{conFecha && <span className="block text-[10px] font-normal text-base-500">{dia(c.fecha_hora)}</span>}{hora(c.fecha_hora)}</span>
        <span className="flex-1 min-w-44">
          <span className="block text-sm font-medium">
            {c.tipo === 'WALKIN' ? `🚶 ${c.nombre_walkin || 'Sin cita'}` : c.clientes?.nombre || (c.nombre_walkin ? `👤 ${c.nombre_walkin}` : 'Cliente')}
            {c.clientes && <span className="ml-2 align-middle"><Insignia verificado={c.clientes.estado_verificacion === 'VERIFIED_100'} /></span>}
            {!c.clientes && c.tipo === 'ONLINE' && <span className="ml-2 align-middle chip !py-0 !px-2 text-[10px]">Anónimo · sin DNI</span>}
          </span>
          <span className="block text-xs text-base-500">
            {c.servicios_cortes?.nombre ?? 'Servicio'} · {!soloBarbero && `${c.barberos?.nombre} · `}{soles(c.precio)}
            {c.clientes?.dni && ` · DNI ${c.clientes.dni}`}{c.clientes?.telefono && <> · <a className="text-acento-500" href={`https://wa.me/51${c.clientes.telefono.replace(/\D/g, '').slice(-9)}`} target="_blank" rel="noopener">WhatsApp</a></>}
          </span>
        </span>
        <span className={`text-xs font-medium ${e.clase}`}>{c.estado === 'PENDIENTE_PAGO' && !c.comprobante_pago_url ? 'Sin adelanto · pide confirmación' : e.texto}</span>
        <span className="flex w-full gap-2 flex-wrap sm:w-auto">
          {!c.cliente_id && c.estado !== 'COMPLETADA' && c.estado !== 'CANCELADA' && c.estado !== 'RECHAZADA' && c.estado !== 'NO_ASISTIO' && (
            <RenombrarSinCuenta cita={c} onListo={cargar} />
          )}
          {c.estado === 'PENDIENTE_PAGO' && mia(c) && (c.comprobante_pago_url
            ? <button className="btn !py-2 text-xs" onClick={() => verComprobante(c)}>🧾 Revisar pago</button>
            : <BotonAccion className="btn-acento !py-2 text-xs" onClick={() => rpc('confirmar_cita_conocido', { p_cita: c.id })}><Check className="size-3" /> Lo conozco · confirmar</BotonAccion>)}
          {(c.estado === 'CONFIRMADA' || c.estado === 'EN_COLA') && <>
            <BotonAccion className="btn !py-2 text-xs" onClick={() => rpc('iniciar_cita', { p_cita: c.id })}><Play className="size-3" /> Iniciar</BotonAccion>
            <BotonAccion className="btn !py-2 text-xs" onClick={() => rpc('marcar_no_asistio', { p_cita: c.id })}>No vino</BotonAccion>
          </>}
          {c.estado === 'EN_CURSO' && <button className="btn-acento !py-2 text-xs" onClick={() => setCompletando(c)}><Check className="size-3" /> Completar</button>}
          {['PENDIENTE_PAGO', 'CONFIRMADA', 'EN_COLA'].includes(c.estado) &&
            <button className="btn !py-2 !px-2 text-xs text-red-500" aria-label="Cancelar cita" onClick={() => confirm('¿Cancelar la cita?') && rpc('cancelar_cita', { p_cita: c.id })}><X className="size-3" /></button>}
        </span>
      </li>
    );
  };

  return (
    <div className="grid gap-4">
      {pendientes.length > 0 && (
        <section data-ayuda="agenda-pendientes" className="neu rounded-2xl p-4 ring-2 ring-amber-500/50">
          <h3 className="titulo text-sm mb-2">🧾 Citas por validar ({pendientes.length})</h3>
          <ul className="grid gap-2">{pendientes.map((c) => <Fila key={c.id} c={c} conFecha />)}</ul>
        </section>
      )}

      <div data-ayuda="agenda-fecha" className="flex flex-wrap items-center gap-2">
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
        <button data-ayuda="agenda-walkin" className="btn-acento" onClick={() => setWalkin(true)}><UserPlus className="size-4" /> Nuevo corte</button>
      </div>

      <div data-ayuda="agenda-resumen" className="grid grid-cols-3 gap-2 text-center">
        <div className={`neu-inset rounded-xl p-2 ${pendientes.length > 0 ? 'ring-1 ring-amber-500/60' : ''}`}>
          <p className="text-base font-semibold tabular-nums sm:text-xl">{pendientes.length > 0 ? pendientes.length : vivas.length}</p>
          <p className="text-[11px] text-base-500">{pendientes.length > 0 ? 'por validar' : 'activas'}</p>
        </div>
        <div className="neu-inset rounded-xl p-2"><p className="text-base font-semibold tabular-nums sm:text-xl">{citas.filter((c) => c.estado === 'COMPLETADA').length}</p><p className="text-[11px] text-base-500">atendidos</p></div>
        <div className="neu-inset rounded-xl p-2"><p className="text-base font-semibold tabular-nums sm:text-xl">{soles(cobrado)}</p><p className="text-[11px] text-base-500">cobrado</p></div>
      </div>
      {error && <Aviso>{error}</Aviso>}
      <ul data-ayuda="agenda-lista" className="grid gap-2">
        {cargando && [0, 1, 2].map((i) => <Esqueleto key={i} className="h-16" />)}
        {!cargando && visibles.map((c) => <Fila key={c.id} c={c} />)}
        {!cargando && visibles.length === 0 && (
          <li className="grid justify-items-center gap-1.5 rounded-2xl border border-dashed border-[var(--borde)] py-10 text-center">
            <span className="text-3xl" aria-hidden="true">{verTodo ? '📭' : '☕'}</span>
            <p className="text-sm font-semibold">{verTodo ? 'Sin citas este día' : 'Nada pendiente por ahora'}</p>
            <p className="text-xs text-base-500">¿Llegó alguien sin cita? Anótalo con <b>Walk-in</b>.</p>
          </li>
        )}
      </ul>

      <Hoja abierta={!!comprobante} onClose={() => setComprobante(null)} titulo="Comprobante de pago">
        {comprobante && (
          <div className="grid gap-3">
            <p className="text-sm">
              {comprobante.cita.clientes ? `${comprobante.cita.clientes.nombre} · DNI ${comprobante.cita.clientes.dni}` : `${comprobante.cita.nombre_walkin || 'Anónimo'} · sin DNI`}
              {' · '}<b>{soles(comprobante.cita.precio)}</b> por {comprobante.cita.metodo_pago}
            </p>
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

      <Hoja abierta={walkin} onClose={() => setWalkin(false)} titulo="Nuevo corte (sin cita)">
        <Walkin barberiaId={barberia.id} barberos={soloBarbero ? barberos.filter((b) => b.id === soloBarbero) : barberos.filter((b) => b.activo)} servicios={servicios}
          onListo={() => { setWalkin(false); cargar(); }} />
      </Hoja>
    </div>
  );
}

/** Corrige el nombre de un cliente sin cuenta (walk-in o anónimo). Con cuenta, el cliente lo cambia desde su perfil. */
function RenombrarSinCuenta({ cita, onListo }: { cita: Cita; onListo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(cita.nombre_walkin ?? '');
  const [error, setError] = useState('');
  async function guardar() {
    setError('');
    const { error } = await supabase.rpc('barbero_renombrar_cita', { p_cita: cita.id, p_nombre: nombre.trim() });
    if (error) return setError(msg(error));
    setEditando(false);
    onListo();
  }
  if (!editando) return (
    <button type="button" className="btn !py-2 text-xs" onClick={() => { setNombre(cita.nombre_walkin ?? ''); setEditando(true); }}>✏️ Nombre</button>
  );
  return (
    <span className="flex w-full flex-wrap items-center gap-2">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} aria-label="Nombre del cliente" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim().length >= 2) guardar(); if (e.key === 'Escape') setEditando(false); }}
        className="campo !w-48 !py-2 !min-h-10 text-sm" />
      <BotonAccion className="btn-acento !py-2 text-xs" disabled={nombre.trim().length < 2} onClick={guardar}>Guardar</BotonAccion>
      <button type="button" className="btn !py-2 text-xs" onClick={() => setEditando(false)}>Cancelar</button>
      {error && <span role="alert" className="w-full text-xs text-red-500">{error}</span>}
    </span>
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

export function Walkin({ barberiaId, barberos, servicios, onListo }: { barberiaId: string; barberos: Barbero[]; servicios: Servicio[]; onListo: () => void }) {
  // Lo que más hace cada barbero sale primero: se busca más rápido en la lista.
  const [barberoId, setBarberoId] = useState(barberos[0]?.id ?? '');
  const [servicioId, setServicioId] = useState('');
  const [conteo, setConteo] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!barberoId) return;
    supabase.from('citas').select('servicio_id').eq('barbero_id', barberoId).eq('estado', 'COMPLETADA')
      .order('fecha_hora', { ascending: false }).limit(500)
      .then(({ data }) => {
        const c: Record<string, number> = {};
        for (const r of (data ?? []) as { servicio_id: string | null }[]) if (r.servicio_id) c[r.servicio_id] = (c[r.servicio_id] ?? 0) + 1;
        setConteo(c);
        const orden = [...servicios].sort((a, b) => (c[b.id] ?? 0) - (c[a.id] ?? 0) || a.precio_base - b.precio_base);
        setServicioId(orden[0]?.id ?? '');
      });
  }, [barberoId, servicios]);
  const ordenServicios = [...servicios].sort((a, b) => (conteo[b.id] ?? 0) - (conteo[a.id] ?? 0) || a.precio_base - b.precio_base);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Dos modos excluyentes: cada uno muestra solo sus campos. Cambiar de modo limpia lo anterior.
  const [modo, setModo] = useState<'DOCUMENTO' | 'ANONIMO'>('DOCUMENTO');
  const anonimo = modo === 'ANONIMO';
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [tipo, setTipo] = useState<'DNI' | 'CE' | 'PASAPORTE'>('DNI');
  const [frecuentes, setFrecuentes] = useState<{ nombre: string; dni: string }[]>([]);
  const [historial, setHistorial] = useState<{ servicio: string; fecha: string; barbero: string }[] | null>(null);
  const [telefono, setTelefono] = useState('');
  const [registrado, setRegistrado] = useState(false);
  // Cliente que ya existe con ese documento: no hay nada que registrar.
  const [existente, setExistente] = useState<{ id: string; nombre: string | null } | null>(null);
  const [registrando, setRegistrando] = useState(false);
  type Cli = { id: string; nombre: string | null; dni: string | null; telefono: string | null; estado_verificacion: string };
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Cli[] | null>(null);
  const [elegido, setElegido] = useState<{ nombre: string | null; dni: string | null } | null>(null);
  const [mostrarRegistro, setMostrarRegistro] = useState(false);
  const puedeContactos = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
  // Cambiar el documento invalida el "ya registrado": nunca se registra solo, solo al pulsar el botón.
  useEffect(() => setRegistrado(false), [dni, tipo]);

  async function registrarSinCita() {
    setError(''); setRegistrando(true);
    // Sin nombre escrito, se toma del DNI (RENIEC) antes de registrar.
    let nom = nombre.trim();
    if (nom.length < 2 && tipo === 'DNI') {
      const r = await consultarDni(dni);
      if (r.error) { setRegistrando(false); return setError(r.error); }
      nom = r.nombre!;
      setNombre(nom);
    }
    if (nom.length < 2) { setRegistrando(false); return setError('Escribe el nombre del cliente'); }
    const { error } = await supabase.rpc('barbero_registrar_cliente', {
      p_dni: dni, p_tipo: tipo, p_nombre: nom, p_telefono: telefono.trim(),
    });
    setRegistrando(false);
    if (error) return setError(msg(error));
    setRegistrado(true);
  }

  function cambiarModo(m: 'DOCUMENTO' | 'ANONIMO') {
    setModo(m); setError(''); setDni(''); setNombre(''); setHistorial(null);
    setQ(''); setResultados(null); setElegido(null); setMostrarRegistro(false);
  }

  function elegir(c: { nombre: string | null; dni: string | null; telefono?: string | null }) {
    setElegido({ nombre: c.nombre, dni: c.dni });
    setNombre(c.nombre ?? ''); setDni(c.dni ?? ''); setTelefono(c.telefono ?? '');
    setTipo('DNI'); setResultados(null); setMostrarRegistro(false); setQ(c.nombre ?? c.dni ?? '');
  }

  // Busca por DNI, nombre o celular mientras escribe.
  useEffect(() => {
    const t = q.trim();
    if (anonimo || elegido || t.length < 3) { setResultados(null); return; }
    let vivo = true;
    const espera = setTimeout(async () => {
      const { data } = await supabase.rpc('buscar_clientes_staff', { p_q: t });
      if (vivo) setResultados((data ?? []) as Cli[]);
    }, 300);
    return () => { vivo = false; clearTimeout(espera); };
  }, [q, anonimo, elegido]);

  async function elegirContacto() {
    try {
      const nav = navigator as unknown as { contacts: { select: (p: string[], o: object) => Promise<{ tel?: string[] }[]> } };
      const [c] = await nav.contacts.select(['name', 'tel'], { multiple: false });
      const tel = (c?.tel?.[0] ?? '').replace(/\D/g, '');
      if (tel) setQ(tel.slice(-9));
    } catch { /* el usuario canceló */ }
  }

  // Solo clientes con documento: un anónimo no tiene cartilla que recordar.
  useEffect(() => {
    supabase.from('citas').select('clientes(nombre, dni)').eq('barberia_id', barberiaId)
      .order('fecha_hora', { ascending: false }).limit(300)
      .then(({ data }) => {
        const cuenta = new Map<string, { nombre: string; dni: string; n: number }>();
        for (const c of (data ?? []) as unknown as { clientes: { nombre: string | null; dni: string | null } | null }[]) {
          if (!c.clientes?.dni) continue;
          const nom = c.clientes.nombre || c.clientes.dni;
          cuenta.set(c.clientes.dni, { nombre: nom, dni: c.clientes.dni, n: (cuenta.get(c.clientes.dni)?.n ?? 0) + 1 });
        }
        setFrecuentes([...cuenta.values()].sort((a, b) => b.n - a.n).slice(0, 8));
      });
  }, [barberiaId]);

  // Historial "lo de siempre": solo al tener un documento completo y en modo con documento.
  useEffect(() => {
    setHistorial(null); setExistente(null);
    if (anonimo) return;
    const valido = tipo === 'DNI' ? dni.length === 8 : dni.length >= 6;
    if (!valido) return;
    let vivo = true;
    (async () => {
      const { data: encontrados } = await supabase.rpc('buscar_cliente_dni', { p_dni: dni });
      const hallado = (encontrados as { id: string; nombre: string | null }[] | null)?.[0];
      const id = hallado?.id;
      if (vivo) setExistente(hallado ? { id: hallado.id, nombre: hallado.nombre } : null);
      if (!id) { if (vivo) setHistorial([]); return; }
      const { data } = await supabase.from('citas').select('fecha_hora, servicios_cortes(nombre), barberos(nombre)')
        .eq('barberia_id', barberiaId).eq('cliente_id', id).eq('estado', 'COMPLETADA')
        .order('fecha_hora', { ascending: false }).limit(50);
      if (!vivo) return;
      setHistorial(((data ?? []) as unknown as { fecha_hora: string; servicios_cortes: { nombre: string } | null; barberos: { nombre: string } | null }[])
        .map((c) => ({ servicio: c.servicios_cortes?.nombre ?? 'Corte', fecha: c.fecha_hora, barbero: c.barberos?.nombre ?? '' })));
    })();
    return () => { vivo = false; };
  }, [dni, tipo, modo, barberiaId]);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!anonimo && !elegido && !dni) return setError('Busca al cliente o regístralo antes de agregarlo');
    const f = new FormData(e.currentTarget);
    setEnviando(true); setError('');
    const { error } = await supabase.rpc('agregar_walkin', {
      p_barbero: barberoId, p_nombre: nombre.trim() || 'Anónimo',
      p_dni: anonimo ? null : dni.trim(), p_servicio: servicioId || null, p_tipo: tipo,
    });
    setEnviando(false);
    if (error) setError(msg(error)); else onListo();
  }

  const opciones = [
    { v: 'DOCUMENTO', t: 'Con documento', d: 'Suma cortes a su cartilla' },
    { v: 'ANONIMO', t: 'Anónimo', d: 'Sin DNI · no se guarda' },
  ] as const;

  return (
    <form onSubmit={enviar} className="grid gap-4">
      <div role="radiogroup" aria-label="Tipo de atención" className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[var(--superficie)] p-1.5">
        {opciones.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={modo === o.v} onClick={() => cambiarModo(o.v)}
            className={`min-h-12 rounded-xl px-3 py-2 text-left transition-colors ${modo === o.v ? 'bg-acento-500 text-black' : 'text-[var(--texto-suave)] hover:text-[var(--texto)]'}`}>
            <span className="block text-sm font-bold">{o.t}</span>
            <span className="block text-xs opacity-80">{o.d}</span>
          </button>
        ))}
      </div>

      {anonimo ? (
        <div className="grid gap-2">
          <label><span className="etiqueta">Nombre (opcional)</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} className="campo" placeholder="Déjalo vacío para “Anónimo”" /></label>
          <p className="text-xs text-[var(--texto-suave)]">Corte sin documento: queda en caja y estadísticas, pero no crea cliente ni suma a una cartilla.</p>
        </div>
      ) : (
        <>
          {frecuentes.length > 0 && (
            <div className="grid gap-1.5">
              <span className="etiqueta">Clientes frecuentes</span>
              <div className="flex flex-wrap gap-1.5">
                {frecuentes.map((c) => (
                  <button type="button" key={c.dni} onClick={() => elegir({ nombre: c.nombre, dni: c.dni })}
                    className="chip min-h-9 !px-3 !text-sm">{c.nombre}</button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <label className="etiqueta" htmlFor="walkin-buscar">Buscar cliente</label>
            <div className="flex gap-2">
              <input id="walkin-buscar" value={q} onChange={(e) => { setQ(e.target.value); setElegido(null); setDni(''); setNombre(''); setTelefono(''); }}
                placeholder="DNI, nombre o celular" autoComplete="off" className="campo" />
              {puedeContactos && <button type="button" className="btn shrink-0" onClick={elegirContacto} aria-label="Elegir de mis contactos">📇</button>}
            </div>
            {resultados && resultados.length > 0 && (
              <ul className="grid gap-1.5">
                {resultados.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => elegir(c)} className="panel w-full text-left">
                      <b className="text-sm">{c.nombre ?? 'Sin nombre'}</b>
                      <span className="block text-xs text-[var(--texto-suave)]">{c.dni ? `DNI ${c.dni}` : 'Sin DNI'}{c.telefono ? ` · ${c.telefono}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!puedeContactos && <span className="text-xs text-[var(--texto-suave)]">Elegir de contactos funciona en Android con Chrome. En iPhone escribe el nombre o el celular.</span>}
          </div>

          {elegido && (
            <div className="panel grid gap-1 text-sm">
              <span>Cliente: <b>{elegido.nombre ?? 'Sin nombre'}</b>{elegido.dni ? ` · DNI ${elegido.dni}` : ' · sin DNI (no suma a cartilla)'}</span>
              <button type="button" className="w-fit text-xs underline text-[var(--texto-suave)]" onClick={() => { setElegido(null); setDni(''); setNombre(''); setQ(''); setResultados(null); }}>Cambiar cliente</button>
            </div>
          )}

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
          {existente && !elegido && (
            <p className="text-sm font-semibold text-emerald-500">✅ Ya está registrado{existente.nombre ? `: ${existente.nombre}` : ''}.</p>
          )}

          {!elegido && q.trim().length >= 3 && resultados !== null && (resultados.length === 0 || mostrarRegistro) && (
            <div className="panel grid gap-3">
              <p className="text-sm font-semibold">Registrar cliente nuevo</p>
              <div className="flex gap-2">
                <select value={tipo} onChange={(e) => { setTipo(e.target.value as typeof tipo); setDni(''); }} className="campo !w-auto" aria-label="Tipo de documento">
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de extranjería</option>
                  <option value="PASAPORTE">Pasaporte</option>
                </select>
                <input id="walkin-doc" value={dni} inputMode={tipo === 'DNI' ? 'numeric' : 'text'}
                  onChange={(e) => setDni(tipo === 'DNI' ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase())}
                  placeholder={tipo === 'DNI' ? '8 dígitos' : 'Número de documento'} className="campo" />
              </div>
              <label><span className="etiqueta">Nombre y apellidos</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} className="campo" /></label>
              <label><span className="etiqueta">Celular (opcional, para avisarle)</span>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" maxLength={15} className="campo" placeholder="9xx xxx xxx" /></label>
              {registrado
                ? <p className="text-sm font-semibold text-emerald-500">✅ Cliente registrado. Ya puedes agregarlo a la cola.</p>
                : <button type="button" className="btn w-fit" onClick={registrarSinCita} disabled={registrando || dni.length < (tipo === 'DNI' ? 8 : 6)}>
                    {registrando ? 'Registrando…' : '👤 Guardar solo el cliente'}
                  </button>}
            </div>
          )}

          {!elegido && q.trim().length >= 3 && resultados !== null && resultados.length > 0 && !mostrarRegistro && (
            <button type="button" className="text-sm underline text-[var(--texto-suave)] w-fit" onClick={() => setMostrarRegistro(true)}>+ Registrar cliente nuevo</button>
          )}
        </>
      )}

      <label><span className="etiqueta">Barbero</span>
        <select value={barberoId} onChange={(e) => setBarberoId(e.target.value)} className="campo">{barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre} {b.cola ? `(cola ${b.cola})` : ''}</option>)}</select></label>
      <label><span className="etiqueta">Servicio</span>
        <select value={servicioId} onChange={(e) => setServicioId(e.target.value)} className="campo">{ordenServicios.map((s) => <option key={s.id} value={s.id}>{conteo[s.id] ? `⭐ ${s.nombre}` : s.nombre} · {soles(s.precio_base)}{conteo[s.id] ? ` · ${conteo[s.id]} hechos` : ''}</option>)}</select></label>
      {error && <Aviso>{error}</Aviso>}
      <button disabled={enviando || barberos.length === 0} className="btn-acento">{enviando ? 'Agregando…' : 'Agregar a la cola de hoy'}</button>
    </form>
  );
}
