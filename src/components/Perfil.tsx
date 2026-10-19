import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { msg, notificar, supabase } from '@/lib/supabase';
import { hoyLima } from '@/lib/agenda';
import { BotonAccion } from './ui';
import { entrarConGoogle, useSesion } from '@/lib/useSesion';
import type { Cita, Premio } from '@/lib/tipos';
import { ESTADOS_CITA, soles } from '@/lib/tipos';
import { Aviso, BotonGoogle, Cargando, Insignia, RegistroDni } from './ui';

interface Progreso { id: string; barberia_id: string; barbero_id: string | null; total_cortes_acumulados: number; barberias: { nombre: string; modo_gamificacion: 'GLOBAL' | 'POR_BARBERO' }; barberos: { nombre: string } | null }
interface Voucher { id: string; codigo: string; tipo_premio: string; valor_descuento: number; usado_at: string | null; created_at: string; barberias: { nombre: string }; barberos: { nombre: string } | null }

const fmt = (iso: string) => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Perfil() {
  const { user, cliente, setCliente, cargando } = useSesion();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [progreso, setProgreso] = useState<Progreso[]>([]);
  const [premios, setPremios] = useState<Premio[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [error, setError] = useState('');
  const [v, setV] = useState(0);
  const [reprog, setReprog] = useState<{ id: string; fecha: string; hora: string } | null>(null);

  useEffect(() => {
    if (!cliente) return;
    (async () => {
      const [c, p, vo] = await Promise.all([
        supabase.from('citas').select('*, servicios_cortes(nombre), barberos(nombre)').eq('cliente_id', cliente.id).order('fecha_hora', { ascending: false }).limit(50),
        supabase.from('gamificacion_progreso').select('*, barberias(nombre, modo_gamificacion), barberos(nombre)').eq('cliente_id', cliente.id),
        supabase.from('gamificacion_vouchers').select('*, barberias(nombre), barberos(nombre)').eq('cliente_id', cliente.id).order('created_at', { ascending: false }),
      ]);
      setCitas((c.data ?? []) as Cita[]);
      setProgreso((p.data ?? []) as Progreso[]);
      setVouchers((vo.data ?? []) as Voucher[]);
      const ids = [...new Set([...(p.data ?? []).map((x) => x.barberia_id)])];
      if (ids.length) {
        const { data } = await supabase.from('gamificacion_premios').select('*').in('barberia_id', ids).eq('activo', true);
        setPremios(data ?? []);
      }
    })();
  }, [cliente?.id, v]);

  if (cargando) return <Cargando />;
  if (!user) return (
    <div className="max-w-sm mx-auto neu rounded-3xl p-6 grid gap-4 text-center">
      <p className="text-5xl">💈</p>
      <h1 className="titulo text-xl">Tu perfil de cliente</h1>
      <p className="text-sm text-base-500">Tus citas, tu tarjeta de lealtad y tus cupones, en un solo lugar.</p>
      <BotonGoogle onClick={entrarConGoogle} />
    </div>
  );
  if (!cliente) return <div className="max-w-sm mx-auto neu rounded-3xl p-6"><h1 className="titulo text-xl mb-4">Completa tu registro</h1><RegistroDni email={user.email} onListo={setCliente} /></div>;

  async function cancelar(id: string) {
    if (!confirm('¿Cancelar esta cita?')) return;
    const { error } = await supabase.rpc('cancelar_cita', { p_cita: id });
    if (error) setError(msg(error)); else { notificar('cita_cancelada', id); setV((x) => x + 1); }
  }
  async function reprogramar() {
    if (!reprog) return;
    setError('');
    const { error } = await supabase.rpc('reprogramar_cita', {
      p_cita: reprog.id, p_inicio: new Date(`${reprog.fecha}T${reprog.hora}:00-05:00`).toISOString(),
    });
    if (error) return setError(msg(error));
    notificar('cita_reprogramada', reprog.id);
    setReprog(null);
    setV((x) => x + 1);
  }
  const ahora = Date.now();
  const proximas = citas.filter((c) => Date.parse(c.fecha_hora) > ahora - 3600e3 && ['PENDIENTE_PAGO', 'CONFIRMADA', 'EN_CURSO', 'EN_COLA'].includes(c.estado));
  const historial = citas.filter((c) => !proximas.includes(c));

  return (
    <div className="grid gap-6">
      <section className="neu rounded-3xl p-5 flex flex-wrap items-center gap-4">
        {user.user_metadata?.avatar_url && <img src={user.user_metadata.avatar_url} alt="" className="size-14 rounded-full" referrerPolicy="no-referrer" />}
        <div className="flex-1 min-w-0">
          <h1 className="titulo text-xl truncate">Hola, {cliente.nombre?.split(' ')[0] || 'crack'} 👋</h1>
          <p className="text-xs text-base-500">DNI ••••{cliente.dni.slice(-3)} · {cliente.email}</p>
        </div>
        <Insignia verificado={cliente.estado_verificacion === 'VERIFIED_100'} />
        <button className="btn !py-1.5 text-xs" onClick={() => supabase.auth.signOut().then(() => location.reload())}>Salir</button>
      </section>
      {cliente.estado_verificacion === 'UNVERIFIED' && (
        <Aviso tipo="info">Para quedar 100% verificado: paga tu primera reserva por Yape/Plin, o pide en el local que validen tu DNI. Así tus próximas citas se confirman al instante.</Aviso>
      )}
      {error && <Aviso>{error}</Aviso>}

      <section>
        <h2 className="titulo mb-3">🎯 Tarjeta de lealtad</h2>
        {progreso.length === 0 ? <p className="text-sm text-base-500">Completa tu primer corte para empezar a sumar.</p> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {progreso.filter((p) => {
              const modoOk = p.barberias.modo_gamificacion === 'POR_BARBERO' ? !!p.barbero_id : !p.barbero_id;
              const hayPremio = premios.some((x) => x.barberia_id === p.barberia_id && (x.barbero_id === p.barbero_id || !x.barbero_id));
              return modoOk && hayPremio;
            }).map((p) => {
              const pr = premios.find((x) => x.barberia_id === p.barberia_id && x.barbero_id === p.barbero_id)
                ?? premios.find((x) => x.barberia_id === p.barberia_id && !x.barbero_id);
              const meta = pr?.meta_cortes ?? 10;
              const llevas = p.total_cortes_acumulados % meta;
              const premio = pr ? (pr.tipo_premio === 'GRATIS' ? 'tu corte GRATIS' : `${pr.valor_descuento}% de descuento`) : 'tu premio';
              return (
                <div key={p.id} className="neu rounded-2xl p-4 grid gap-3">
                  <p className="text-sm font-medium">{p.barberias.nombre}{p.barberos && ` · con ${p.barberos.nombre}`}</p>
                  <div className="flex gap-1.5 flex-wrap" aria-hidden="true">
                    {Array.from({ length: meta }, (_, i) => (
                      <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.04 }}
                        className={`size-7 rounded-full grid place-items-center text-xs ${i < llevas ? 'bg-acento-500 text-white' : 'neu-inset text-base-400'}`}>
                        {i < llevas ? '✂️' : i + 1}
                      </motion.span>
                    ))}
                  </div>
                  <div className="h-2 rounded-full neu-inset overflow-hidden">
                    <motion.div className="h-full bg-acento-500" initial={{ width: 0 }} animate={{ width: `${(llevas / meta) * 100}%` }} />
                  </div>
                  <p className="text-sm">Llevas <b>{llevas}/{meta}</b> cortes. ¡Te faltan <b>{meta - llevas}</b> para {premio}!</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {vouchers.length > 0 && (
        <section>
          <h2 className="titulo mb-3">🎁 Mis cupones</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {vouchers.map((x) => (
              <div key={x.id} className={`neu rounded-2xl p-4 border-2 border-dashed ${x.usado_at ? 'opacity-50 border-base-400/40' : 'border-acento-500/60'}`}>
                <p className="text-lg font-bold">{x.tipo_premio === 'GRATIS' ? 'Corte GRATIS' : `${x.valor_descuento}% dscto`}</p>
                <p className="text-xs text-base-500">{x.barberias.nombre}{x.barberos && ` · ${x.barberos.nombre}`}</p>
                <p className="mt-2 font-mono tracking-widest">{x.codigo}</p>
                <p className="text-[11px] text-base-400">{x.usado_at ? 'Canjeado' : 'Úsalo al reservar tu próxima cita'}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="titulo mb-3">📅 Próximas citas</h2>
        {reprog && (
          <form onSubmit={(e) => { e.preventDefault(); reprogramar(); }} className="panel mb-3 grid gap-3">
            <p className="text-sm font-semibold">Elige la nueva fecha y hora. Tu barbero recibirá el aviso.</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" required min={hoyLima()} value={reprog.fecha} onChange={(e) => setReprog({ ...reprog, fecha: e.target.value })} className="campo" aria-label="Nueva fecha" />
              <input type="time" required step={1800} value={reprog.hora} onChange={(e) => setReprog({ ...reprog, hora: e.target.value })} className="campo" aria-label="Nueva hora" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-acento">Guardar nueva hora</button>
              <button type="button" className="btn" onClick={() => setReprog(null)}>No cambiar</button>
            </div>
          </form>
        )}
        {proximas.length === 0 ? <p className="text-sm text-base-500">No tienes citas. <a href="/" className="text-acento-500">Reserva una</a>.</p> : (
          <ul className="grid gap-2">
            {proximas.map((c) => (
              <li key={c.id} className="neu-sm rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="flex-1 min-w-40">
                  <b className="text-sm block">{c.servicios_cortes?.nombre} · {c.barberos?.nombre}</b>
                  <span className="text-xs text-base-500">{fmt(c.fecha_hora)} · {soles(c.precio)}</span>
                </span>
                <span className={`text-xs font-medium ${ESTADOS_CITA[c.estado].clase}`}>{ESTADOS_CITA[c.estado].texto}</span>
                {['PENDIENTE_PAGO', 'CONFIRMADA'].includes(c.estado) && (
                  <span className="flex gap-2">
                    <button onClick={() => setReprog({ id: c.id, fecha: '', hora: '' })} className="btn !py-1 text-xs">Cambiar hora</button>
                    <BotonAccion onClick={() => cancelar(c.id)} className="btn !py-1 text-xs text-red-500">Cancelar</BotonAccion>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="titulo mb-3">✂️ Historial de cortes</h2>
        {historial.length === 0 ? <p className="text-sm text-base-500">Aún no hay cortes registrados.</p> : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {historial.map((c) => (
              <li key={c.id} className="neu-sm rounded-xl p-3 flex gap-3">
                {c.foto_corte_url ? <img src={c.foto_corte_url} alt="Foto del corte" className="size-16 rounded-lg object-cover" loading="lazy" />
                  : <span className="size-16 rounded-lg neu-inset grid place-items-center text-2xl">💇‍♂️</span>}
                <span className="text-sm">
                  <b className="block">{c.servicios_cortes?.nombre ?? 'Corte'}</b>
                  <span className="text-xs text-base-500 block">{fmt(c.fecha_hora)} · {c.barberos?.nombre}</span>
                  <span className={`text-xs ${ESTADOS_CITA[c.estado].clase}`}>{ESTADOS_CITA[c.estado].texto}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
