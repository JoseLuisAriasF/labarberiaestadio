import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock, MessageCircle, Upload } from 'lucide-react';
import { msg, notificar, subirImagen, supabase } from '@/lib/supabase';
import { bloquesDelDia, hoyLima, isoDow, sumarDias, type Bloque } from '@/lib/agenda';
import { entrarConGoogle, useSesion } from '@/lib/useSesion';
import type { Barbero } from '@/lib/tipos';
import { DIAS, soles } from '@/lib/tipos';
import type { DatosBarberia } from '@/lib/useBarberia';
import { Aviso, BotonGoogle, Cargando, Insignia, RegistroDni } from './ui';

const BORRADOR = 'be:reserva';
interface Voucher { id: string; codigo: string; tipo_premio: string; valor_descuento: number; barbero_id: string | null }

export function guardarBorrador(d: { barberoId: string; servicioId?: string; fecha?: string; hora?: string }) {
  sessionStorage.setItem(BORRADOR, JSON.stringify(d));
}
export function leerBorrador(): { barberoId: string; servicioId?: string; fecha?: string; hora?: string } | null {
  try { return JSON.parse(sessionStorage.getItem(BORRADOR) || 'null'); } catch { return null; }
}

export default function Reserva({ datos, barbero, onListo }: { datos: DatosBarberia; barbero: Barbero; onListo: () => void }) {
  const { barberia } = datos;
  const { user, cliente, setCliente, cargando } = useSesion();
  const borrador = useMemo(() => { const b = leerBorrador(); return b?.barberoId === barbero.id ? b : null; }, [barbero.id]);

  const delBarbero = datos.barberoServicios.filter((x) => x.barbero_id === barbero.id).map((x) => x.servicio_id);
  const servicios = datos.servicios.filter((s) => delBarbero.length === 0 || delBarbero.includes(s.id));
  const [servicioId, setServicioId] = useState(borrador?.servicioId || servicios[0]?.id || '');
  const servicio = servicios.find((s) => s.id === servicioId);

  const dias = useMemo(() => Array.from({ length: 14 }, (_, i) => sumarDias(hoyLima(), i)), []);
  const [fecha, setFecha] = useState(borrador?.fecha || dias.find((d) => barbero.horario_atencion[String(isoDow(d))]) || dias[0]);
  const [bloques, setBloques] = useState<Bloque[] | null>(null);
  const [hora, setHora] = useState<string | undefined>(borrador?.hora);

  const [metodo, setMetodo] = useState<'YAPE' | 'PLIN'>('YAPE');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherId, setVoucherId] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ estado: string } | null>(null);

  // Horas: horario del barbero − citas vivas (RPC sin datos personales).
  useEffect(() => {
    if (!servicio) return;
    setBloques(null);
    const desde = new Date(`${fecha}T00:00:00-05:00`).toISOString();
    const hasta = new Date(`${sumarDias(fecha, 1)}T00:00:00-05:00`).toISOString();
    supabase.rpc('horarios_ocupados', { p_barbero: barbero.id, p_desde: desde, p_hasta: hasta }).then(({ data }) => {
      setBloques(bloquesDelDia(fecha, barbero.horario_atencion, servicio.duracion_min, data ?? []));
    });
  }, [fecha, servicio?.id, barbero.id]);

  useEffect(() => {
    if (!cliente) return;
    supabase.from('gamificacion_vouchers').select('id, codigo, tipo_premio, valor_descuento, barbero_id')
      .eq('cliente_id', cliente.id).eq('barberia_id', barberia.id).is('usado_at', null)
      .then(({ data }) => setVouchers((data ?? []).filter((v) => !v.barbero_id || v.barbero_id === barbero.id)));
  }, [cliente?.id]);

  if (servicios.length === 0) return <Aviso tipo="info">Este barbero aún no tiene servicios publicados.</Aviso>;
  if (hecho) return <Listo estado={hecho.estado} barbero={barbero} servicio={servicio!.nombre} fecha={fecha} hora={hora!} onListo={onListo} duracion={servicio!.duracion_min} />;

  const verificado = cliente?.estado_verificacion === 'VERIFIED_100';
  const voucher = vouchers.find((v) => v.id === voucherId);
  const precio = servicio ? servicio.precio_base * (1 - (voucher?.valor_descuento ?? 0) / 100) : 0;
  // A quién se le paga depende del modelo financiero del local.
  const pago = barberia.modo_financiero === 'CENTRALIZADO'
    ? { a: barberia.titular_pago || barberia.nombre, yape: barberia.yape_numero, plin: barberia.plin_numero, qr: barberia.qr_pago_url }
    : { a: barbero.nombre, yape: barbero.yape_numero, plin: barbero.plin_numero, qr: null };
  const cerradoHoy = !barbero.horario_atencion[String(isoDow(fecha))];

  async function confirmar() {
    if (!servicio || !hora || !user || !cliente) return;
    setEnviando(true); setError('');
    try {
      let ruta: string | null = null;
      if (archivo) ruta = (await subirImagen('comprobantes', `${barberia.id}/${user.id}`, archivo)).ruta;
      if (!verificado && !ruta) throw new Error('Adjunta la captura de tu Yape/Plin');
      const inicio = new Date(`${fecha}T${hora}:00-05:00`).toISOString();
      const { data: citaId, error } = await supabase.rpc('reservar_cita', {
        p_barbero: barbero.id, p_servicio: servicio.id, p_inicio: inicio,
        p_comprobante: ruta, p_metodo: ruta ? metodo : null, p_voucher: voucherId || null,
      });
      if (error) throw error;
      sessionStorage.removeItem(BORRADOR);
      const estado = verificado && !ruta ? 'CONFIRMADA' : 'PENDIENTE_PAGO';
      if (citaId) notificar(estado === 'CONFIRMADA' ? 'cita_nueva' : 'pago_recibido', citaId);
      setHecho({ estado });
    } catch (e) { setError(msg(e)); } finally { setEnviando(false); }
  }

  return (
    <div className="grid gap-5">
      <section>
        <h3 className="etiqueta">1 · Servicio</h3>
        <div className="grid gap-2">
          {servicios.map((s) => {
            const best = datos.barberoServicios.some((x) => x.barbero_id === barbero.id && x.servicio_id === s.id && x.es_bestseller);
            return (
              <button key={s.id} onClick={() => { setServicioId(s.id); setHora(undefined); }} aria-pressed={s.id === servicioId}
                className="neu-sm neu-press rounded-xl px-3 py-2.5 text-left flex items-center gap-3 aria-pressed:neu-inset aria-pressed:bg-acento-500/10 aria-pressed:ring-2 aria-pressed:ring-acento-500/60">
                <span className="flex-1">
                  <span className="block text-sm font-medium">{s.nombre} {best && <span className="chip text-amber-500 ml-1">⭐ Best seller</span>}</span>
                  <span className="text-xs text-base-500"><Clock className="inline size-3" /> {s.duracion_min} min</span>
                </span>
                <b className="text-sm">{soles(s.precio_base)}</b>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="etiqueta">2 · Día y hora</h3>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-none">
          {dias.map((d) => {
            const cerrado = !barbero.horario_atencion[String(isoDow(d))];
            return (
              <button key={d} onClick={() => { setFecha(d); setHora(undefined); }} aria-pressed={d === fecha} disabled={cerrado}
                className="snap-start shrink-0 w-16 neu-sm neu-press rounded-xl py-2 text-center aria-pressed:neu-inset aria-pressed:text-acento-500 disabled:opacity-35">
                <span className="block text-[10px] uppercase">{d === dias[0] ? 'Hoy' : DIAS[isoDow(d)].slice(0, 3)}</span>
                <span className="block text-lg font-semibold">{d.slice(8)}</span>
              </button>
            );
          })}
        </div>
        {cerradoHoy ? <Aviso tipo="info">😴 {barbero.nombre} no atiende este día. Prueba otro.</Aviso>
          : !bloques ? <Cargando texto="Buscando horas libres…" />
          : bloques.every((b) => !b.libre) ? <Aviso tipo="info">Este día ya está lleno 🙌. Mira mañana o ponte en la cola en el local.</Aviso>
          : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {bloques.map((b) => (
                <button key={b.hora} disabled={!b.libre} onClick={() => setHora(b.hora)} aria-pressed={b.hora === hora}
                  title={b.motivo} className="neu-sm neu-press rounded-lg py-2 text-sm tabular-nums aria-pressed:bg-acento-500 aria-pressed:text-white disabled:opacity-30 disabled:line-through">
                  {b.hora}
                </button>
              ))}
            </div>
          )}
      </section>

      {hora && servicio && (
        <section className="grid gap-3">
          <h3 className="etiqueta">3 · Tus datos</h3>
          {cargando ? <Cargando /> : !user ? (
            <>
              <p className="text-sm text-base-500">Inicia sesión para guardar tu cita y sumar cortes a tu tarjeta de lealtad.</p>
              <BotonGoogle onClick={() => { guardarBorrador({ barberoId: barbero.id, servicioId, fecha, hora }); entrarConGoogle(); }} />
            </>
          ) : !cliente ? (
            <RegistroDni email={user.email} onListo={setCliente} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>{cliente.nombre} · DNI ••••{cliente.dni.slice(-3)}</span>
                <Insignia verificado={verificado} />
              </div>

              {vouchers.length > 0 && (
                <label><span className="etiqueta">🎁 Usar voucher</span>
                  <select className="campo" value={voucherId} onChange={(e) => setVoucherId(e.target.value)}>
                    <option value="">No usar</option>
                    {vouchers.map((v) => <option key={v.id} value={v.id}>{v.codigo} · {v.tipo_premio === 'GRATIS' ? 'Corte gratis' : `${v.valor_descuento}% dscto`}</option>)}
                  </select>
                </label>
              )}

              {!verificado && (
                <div className="neu-inset rounded-2xl p-4 grid gap-3">
                  <p className="text-sm">
                    🔒 Como es tu primera vez, confirmamos tu cita con el <b>pago adelantado de {soles(precio)}</b>.
                    Tras validarlo quedas <b>100% verificado</b> y las próximas reservas se confirman al instante.
                  </p>
                  <div className="flex gap-2">
                    {(['YAPE', 'PLIN'] as const).map((m) => (
                      <button key={m} onClick={() => setMetodo(m)} aria-pressed={metodo === m}
                        className="flex-1 btn aria-pressed:neu-inset aria-pressed:text-acento-500">{m === 'YAPE' ? '💜 Yape' : '💙 Plin'}</button>
                    ))}
                  </div>
                  <p className="text-sm">
                    Envía a <b>{pago.a}</b>: <b className="tabular-nums select-all">{(metodo === 'YAPE' ? pago.yape : pago.plin) || 'número no configurado — consulta en el local'}</b>
                  </p>
                  {pago.qr && <img src={pago.qr} alt={`QR de pago de ${pago.a}`} className="w-40 rounded-xl mx-auto" loading="lazy" />}
                  <label className="btn cursor-pointer">
                    <Upload className="size-4" /> {archivo ? archivo.name : 'Subir captura del pago'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span>{servicio.nombre} · {DIAS[isoDow(fecha)]} {fecha.slice(8)} · {hora}</span>
                <b className="text-base">{soles(precio)}</b>
              </div>
              {error && <Aviso>{error}</Aviso>}
              <button onClick={confirmar} disabled={enviando || (!verificado && !archivo)} className="btn-gradient py-3">
                <CalendarCheck className="size-5" /> {enviando ? 'Reservando…' : verificado ? 'Confirmar cita' : 'Enviar comprobante y reservar'}
              </button>
              {verificado && barbero.whatsapp && (
                <a href={`https://wa.me/${barbero.whatsapp}?text=${encodeURIComponent(`Hola ${barbero.nombre}, soy ${cliente.nombre}. Quiero confirmar mi cita de ${servicio.nombre} el ${DIAS[isoDow(fecha)]} ${fecha.slice(8)} a las ${hora}. ¡Gracias!`)}`}
                  target="_blank" rel="noopener" className="btn text-green-500 border-green-500/30">
                  <MessageCircle className="size-4" /> Confirmar por WhatsApp
                </a>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Listo({ estado, barbero, servicio, fecha, hora, duracion, onListo }: {
  estado: string; barbero: Barbero; servicio: string; fecha: string; hora: string; duracion: number; onListo: () => void;
}) {
  const ini = new Date(`${fecha}T${hora}:00-05:00`);
  const fin = new Date(ini.getTime() + duracion * 60e3);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const cal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${servicio} con ${barbero.nombre}`)}&dates=${f(ini)}/${f(fin)}&location=${encodeURIComponent(location.origin + '/como-llegar')}`;
  return (
    <div className="text-center grid gap-4 py-4">
      <p className="text-5xl">{estado === 'CONFIRMADA' ? '🎉' : '⏳'}</p>
      <p className="titulo text-lg">{estado === 'CONFIRMADA' ? '¡Cita confirmada!' : '¡Reserva enviada!'}</p>
      <p className="text-sm text-base-500">
        {servicio} con <b>{barbero.nombre}</b> · {DIAS[isoDow(fecha)]} {fecha.slice(8)} a las {hora}.
        {estado !== 'CONFIRMADA' && ' Te confirmamos apenas validemos tu comprobante. Mira el estado en tu perfil.'}
      </p>
      <a href={cal} target="_blank" rel="noopener" className="btn">📅 Añadir a Google Calendar</a>
      {barbero.whatsapp && (
        <a href={`https://wa.me/${barbero.whatsapp}?text=${encodeURIComponent(`Hola ${barbero.nombre}, acabo de reservar ${servicio} para el ${DIAS[isoDow(fecha)]} ${fecha.slice(8)} a las ${hora}. ¡Nos vemos!`)}`}
          target="_blank" rel="noopener" className="btn text-green-500">
          <MessageCircle className="inline size-4" /> Escribir por WhatsApp
        </a>
      )}
      <a href="/perfil" className="btn">Ver mis citas</a>
      <button onClick={onListo} className="text-xs text-base-400">Cerrar</button>
    </div>
  );
}
