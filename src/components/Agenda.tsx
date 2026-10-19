import { useCallback, useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Play, UserPlus, X } from 'lucide-react';
import { msg, notificar, subirImagen, supabase, urlComprobante } from '@/lib/supabase';
import { hoyLima, sumarDias } from '@/lib/agenda';
import type { Barberia, Barbero, Cita, Servicio } from '@/lib/tipos';
import { ESTADOS_CITA, soles } from '@/lib/tipos';
import { Aviso, Hoja, Insignia } from './ui';

const SELECT = '*, clientes(nombre, dni, telefono, estado_verificacion), servicios_cortes(nombre), barberos(nombre)';
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short' });

/** Aviso sonoro corto sin archivos: un "ding" con WebAudio. */
function ding() {
  try {
    const c = new AudioContext(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.2, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    o.start(); o.stop(c.currentTime + 0.5);
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

  const cargar = useCallback(async () => {
    const desde = new Date(`${fecha}T00:00:00-05:00`).toISOString();
    const hasta = new Date(`${sumarDias(fecha, 1)}T00:00:00-05:00`).toISOString();
    let q = supabase.from('citas').select(SELECT).eq('barberia_id', barberia.id).gte('fecha_hora', desde).lt('fecha_hora', hasta).order('fecha_hora');
    let p = supabase.from('citas').select(SELECT).eq('barberia_id', barberia.id).eq('estado', 'PENDIENTE_PAGO').order('fecha_hora');
    if (filtro) { q = q.eq('barbero_id', filtro); p = p.eq('barbero_id', filtro); }
    const [a, b] = await Promise.all([q, p]);
    setCitas((a.data ?? []) as Cita[]);
    setPendientes(((b.data ?? []) as Cita[]).filter(puedeValidar));
  }, [fecha, filtro, barberia.id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Tiempo real: cualquier cambio en las citas del local refresca; un pago nuevo suena.
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const canal = supabase.channel(`citas:${barberia.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas', filter: `barberia_id=eq.${barberia.id}` }, (e) => {
        const c = e.new as Cita;
        if (e.eventType === 'INSERT' && c.estado === 'PENDIENTE_PAGO' && puedeValidar(c)) {
          ding();
          if ('Notification' in window && Notification.permission === 'granted') new Notification('💈 Nuevo comprobante de pago', { body: 'Hay una reserva esperando validación.' });
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
        <span className={`text-xs font-medium ${e.clase}`}>{e.texto}</span>
        <span className="flex gap-1.5 flex-wrap">
          {c.estado === 'PENDIENTE_PAGO' && puedeValidar(c) && <button className="btn !py-1 text-xs" onClick={() => verComprobante(c)}>🧾 Revisar pago</button>}
          {(c.estado === 'CONFIRMADA' || c.estado === 'EN_COLA') && <>
            <button className="btn !py-1 text-xs" onClick={() => rpc('iniciar_cita', { p_cita: c.id })}><Play className="size-3" /> Iniciar</button>
            <button className="btn !py-1 text-xs" onClick={() => rpc('marcar_no_asistio', { p_cita: c.id })}>No vino</button>
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
          <h3 className="titulo text-sm mb-2">🧾 Pagos por validar ({pendientes.length})</h3>
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
        <button className="btn-acento ml-auto" onClick={() => setWalkin(true)}><UserPlus className="size-4" /> Walk-in</button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="neu-inset rounded-xl p-2"><p className="text-xl font-semibold">{vivas.length}</p><p className="text-[11px] text-base-500">citas</p></div>
        <div className="neu-inset rounded-xl p-2"><p className="text-xl font-semibold">{citas.filter((c) => c.estado === 'COMPLETADA').length}</p><p className="text-[11px] text-base-500">atendidos</p></div>
        <div className="neu-inset rounded-xl p-2"><p className="text-xl font-semibold">{soles(cobrado)}</p><p className="text-[11px] text-base-500">facturado</p></div>
      </div>
      {error && <Aviso>{error}</Aviso>}
      <ul className="grid gap-2">
        {citas.map((c) => <Fila key={c.id} c={c} />)}
        {citas.length === 0 && <p className="text-sm text-base-400 text-center py-8">Sin citas este día.</p>}
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
        <Walkin barberos={soloBarbero ? barberos.filter((b) => b.id === soloBarbero) : barberos.filter((b) => b.activo)} servicios={servicios}
          onListo={() => { setWalkin(false); cargar(); }} />
      </Hoja>
    </div>
  );
}

function Completar({ cita, barberiaId, onListo }: { cita: Cita; barberiaId: string; onListo: () => void }) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const yaPagado = cita.verificado_pago;
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
      onListo();
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
      <label><span className="etiqueta">📸 Foto del corte (aparece en el historial del cliente)</span>
        <input name="foto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="text-sm" /></label>
      {error && <Aviso>{error}</Aviso>}
      <button disabled={enviando} className="btn-acento">{enviando ? 'Guardando…' : 'Terminar y liberar silla'}</button>
    </form>
  );
}

function Walkin({ barberos, servicios, onListo }: { barberos: Barbero[]; servicios: Servicio[]; onListo: () => void }) {
  const [error, setError] = useState('');
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.rpc('agregar_walkin', {
      p_barbero: f.get('barbero'), p_nombre: String(f.get('nombre')).trim(),
      p_dni: String(f.get('dni')).trim() || null, p_servicio: f.get('servicio') || null,
    });
    if (error) setError(msg(error)); else onListo();
  }
  return (
    <form onSubmit={enviar} className="grid gap-3">
      <label><span className="etiqueta">Nombre</span><input name="nombre" required className="campo" /></label>
      <label><span className="etiqueta">DNI (opcional, suma a su tarjeta de lealtad)</span><input name="dni" inputMode="numeric" pattern="[0-9]{8}" className="campo" /></label>
      <label><span className="etiqueta">Barbero</span>
        <select name="barbero" className="campo">{barberos.map((b) => <option key={b.id} value={b.id}>{b.nombre} {b.cola ? `(cola ${b.cola})` : ''}</option>)}</select></label>
      <label><span className="etiqueta">Servicio</span>
        <select name="servicio" className="campo">{servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre} · {soles(s.precio_base)}</option>)}</select></label>
      {error && <Aviso>{error}</Aviso>}
      <button className="btn-acento">Agregar a la cola</button>
    </form>
  );
}
