import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, CheckCircle2, ChevronRight, Clock, MessageCircle, Smartphone, Upload, UserRound } from 'lucide-react';
import { msg, notificar, subirImagen, supabase } from '@/lib/supabase';
import { bloquesDelDia, hoyLima, isoDow, sumarDias, type Bloque } from '@/lib/agenda';
import { entrarConGoogle, useSesion } from '@/lib/useSesion';
import type { Barbero } from '@/lib/tipos';
import { DIAS, soles } from '@/lib/tipos';
import type { DatosBarberia } from '@/lib/useBarberia';
import { Aviso, BotonGoogle, Cargando, Esqueleto, Girando, Insignia } from './ui';
import { GuiaReserva, VerGuia, type EstadoGuia } from './GuiaReserva';

const BORRADOR = 'be:reserva';
interface Voucher { id: string; codigo: string; tipo_premio: string; valor_descuento: number; barbero_id: string | null }
type Modo = 'ADELANTO' | 'CONOCIDO';
type Resultado = 'CONFIRMADA' | 'CON_COMPROBANTE' | 'SIN_ADELANTO';

export function guardarBorrador(d: { barberoId: string; servicioId?: string; fecha?: string; hora?: string }) {
  sessionStorage.setItem(BORRADOR, JSON.stringify(d));
}
export function leerBorrador(): { barberoId: string; servicioId?: string; fecha?: string; hora?: string } | null {
  try { return JSON.parse(sessionStorage.getItem(BORRADOR) || 'null'); } catch { return null; }
}

function mensajeWhatsApp(p: { barbero: Barbero; nombre: string; dni?: string; servicio: string; precio: number; fecha: string; hora: string; resultado: Resultado }) {
  const cuando = `el ${DIAS[isoDow(p.fecha)]} ${p.fecha.slice(8)} a las ${p.hora}`;
  const cierre = p.resultado === 'CONFIRMADA' ? '¡Nos vemos!'
    : p.resultado === 'CON_COMPROBANTE' ? 'Te envío mi comprobante de Yape/Plin para confirmar. ¡Gracias!'
    : '¿Me confirmas la cita, por favor? Soy cliente de la barbería. ¡Gracias!';
  const quien = p.dni ? `${p.nombre} (DNI ${p.dni})` : p.nombre;
  return `Hola ${p.barbero.nombre}, soy ${quien}. Reservé *${p.servicio}* (${soles(p.precio)}) ${cuando}. ${cierre}`;
}

export default function Reserva({ datos, barbero, onListo, guia, setGuia }: {
  datos: DatosBarberia; barbero: Barbero; onListo: () => void; guia: EstadoGuia; setGuia: (g: EstadoGuia) => void;
}) {
  const { barberia } = datos;
  const { user, cliente, setCliente, cargando } = useSesion();
  const borrador = useMemo(() => { const b = leerBorrador(); return b?.barberoId === barbero.id ? b : null; }, [barbero.id]);

  const delBarbero = datos.barberoServicios.filter((x) => x.barbero_id === barbero.id).map((x) => x.servicio_id);
  const servicios = datos.servicios.filter((s) => delBarbero.length === 0 || delBarbero.includes(s.id));
  const [servicioId, setServicioId] = useState(borrador?.servicioId || servicios[0]?.id || '');
  const servicio = servicios.find((s) => s.id === servicioId);
  // La guía da por elegido el corte si ya venía marcado, si hay uno solo o si tocó un día.
  const [eligioCorte, setEligioCorte] = useState(!!borrador?.servicioId || servicios.length === 1);

  const dias = useMemo(() => Array.from({ length: 14 }, (_, i) => sumarDias(hoyLima(), i)), []);
  const [fecha, setFecha] = useState(borrador?.fecha || dias.find((d) => barbero.horario_atencion[String(isoDow(d))]) || dias[0]);
  const [bloques, setBloques] = useState<Bloque[] | null>(null);
  const [hora, setHora] = useState<string | undefined>(borrador?.hora);

  const [modo, setModo] = useState<Modo>('ADELANTO');
  // Reserva sin cuenta (!user): nombre + celular. El modo elige si paga adelantado o si "ya le conoce".
  const [sinCuenta, setSinCuenta] = useState(false);
  // Reserva anónima (user con Google, sin DNI): nombre + comprobante.
  const [anonimo, setAnonimo] = useState(false);
  const [nombreAnon, setNombreAnon] = useState('');
  const [celularAnon, setCelularAnon] = useState('');
  const [metodo, setMetodo] = useState<'YAPE' | 'PLIN'>('YAPE');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherId, setVoucherId] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ resultado: Resultado; precio: number } | null>(null);

  useEffect(() => {
    if (!servicio) return;
    setBloques(null);
    const desde = new Date(`${fecha}T00:00:00-05:00`).toISOString();
    const hasta = new Date(`${sumarDias(fecha, 1)}T00:00:00-05:00`).toISOString();
    supabase.rpc('horarios_ocupados', { p_barbero: barbero.id, p_desde: desde, p_hasta: hasta }).then(({ data }) => {
      setBloques(bloquesDelDia(fecha, barbero.horario_atencion, servicio.duracion_min, data ?? []));
    });
  }, [fecha, servicio?.id, barbero.id]);

  // Al elegir hora, el paso 3 sube solo: no hay que buscar el botón de confirmar.
  const paso2 = useRef<HTMLElement>(null);
  const paso3 = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hora) requestAnimationFrame(() => paso3.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }, [hora]);

  useEffect(() => {
    if (!cliente) return;
    supabase.from('gamificacion_vouchers').select('id, codigo, tipo_premio, valor_descuento, barbero_id')
      .eq('cliente_id', cliente.id).eq('barberia_id', barberia.id).is('usado_at', null)
      .then(({ data }) => setVouchers((data ?? []).filter((v) => !v.barbero_id || v.barbero_id === barbero.id)));
  }, [cliente?.id]);

  if (servicios.length === 0) return <Aviso tipo="info">Este barbero aún no tiene servicios publicados.</Aviso>;
  const verGuia = guia === 'si';
  const bloqueGuia = (paso: number, texto: string, listo?: boolean) => (
    <div className="sticky -top-5 z-10 -mx-1 -mt-1 bg-[var(--tarjeta)] pt-1 pb-1">
      {verGuia ? <GuiaReserva paso={paso} texto={texto} listo={listo} onOcultar={() => setGuia('oculta')} />
        : <VerGuia onClick={() => setGuia('si')} />}
    </div>
  );
  if (hecho) return (
    <div className="grid gap-4">
    {bloqueGuia(5, barbero.whatsapp ? 'Toca el botón verde para avisarle por WhatsApp. Tu cita también queda en «Ver mis citas».' : 'Tu cita queda guardada en «Ver mis citas».', true)}
    <Listo barbero={barbero} nombre={cliente?.nombre ?? nombreAnon.trim()} dni={cliente?.dni ?? undefined} servicio={servicio!.nombre} precio={hecho.precio} fecha={fecha} hora={hora!}
      duracion={servicio!.duracion_min} resultado={hecho.resultado} onListo={onListo} />
    </div>
  );

  const verificado = cliente?.estado_verificacion === 'VERIFIED_100';
  const voucher = vouchers.find((v) => v.id === voucherId);
  const precio = servicio ? servicio.precio_base * (1 - (voucher?.valor_descuento ?? 0) / 100) : 0;
  const pago = barberia.modo_financiero === 'CENTRALIZADO'
    ? { a: barberia.titular_pago || barberia.nombre, yape: barberia.yape_numero, plin: barberia.plin_numero, qr: barberia.qr_pago_url }
    : { a: barbero.nombre, yape: barbero.yape_numero, plin: barbero.plin_numero, qr: null };
  const cerradoHoy = !barbero.horario_atencion[String(isoDow(fecha))];
  // Sin cuenta: siempre CONOCIDO (el barbero confirma por WhatsApp; adelanto se gestiona por WhatsApp fuera del sistema).
  const sinAdelanto = sinCuenta ? true : (!verificado && !anonimo && modo === 'CONOCIDO');
  const pideAdelanto = sinCuenta ? false : (anonimo || (!verificado && modo === 'ADELANTO'));
  // Qué falta para poder confirmar: lo usa el botón y la guía.
  const falta = (sinCuenta || anonimo) && nombreAnon.trim().length < 2 ? 'escribe tu nombre'
    : sinCuenta && celularAnon.replace(/\D/g, '').length < 6 ? 'escribe tu celular'
    : pideAdelanto && !archivo ? 'sube la captura de tu pago' : '';

  const eligiendoCuenta = !user && !sinCuenta;
  const etapa = !hora ? (eligioCorte ? 3 : 2)
    : cargando || eligiendoCuenta || (user && !cliente && !anonimo) || falta === 'escribe tu nombre' || falta === 'escribe tu celular' ? 4 : 5;
  const textoGuia = etapa === 2 ? 'Toca el corte que quieres. Verás el precio y cuánto demora.'
    : etapa === 3 ? (cerradoHoy || bloques?.every((b) => !b.libre)
      ? 'Ese día no hay horas libres. Toca otro día en la fila de fechas (puedes deslizarla).'
      : 'Toca un día y luego una hora. Las horas tachadas ya están ocupadas.')
    : cargando || (user && !cliente && !anonimo) ? 'Un momento, estamos cargando tu cuenta…'
    : eligiendoCuenta ? 'Elige una de las 3 opciones de abajo. Si es tu primera vez, la más fácil es «Crear cuenta con mi celular».'
    : sinCuenta && falta ? 'Escribe tu nombre y tu celular. El barbero te confirmará la cita por WhatsApp.'
    : falta === 'escribe tu nombre' ? 'Escribe tu nombre para que el barbero te reconozca.'
    : falta ? `Paga ${soles(precio)} por ${metodo === 'YAPE' ? 'Yape' : 'Plin'} al número que ves. Luego toca «Subir captura del pago» y elige la foto del pago.`
    : 'Revisa el resumen y toca el botón dorado de abajo para terminar.';
  const foco = (n: number) => (verGuia && etapa === n ? 'guia-foco' : '');

  async function confirmar() {
    if (!servicio || !hora) return;
    if (!sinCuenta && (!user || (!cliente && !anonimo))) return;
    setEnviando(true); setError('');
    try {
      let ruta: string | null = null;
      // Reserva sin cuenta: nombre + celular. Barbero confirma por WhatsApp (sin subir comprobante al sistema).
      if (sinCuenta) {
        if (nombreAnon.trim().length < 2) throw new Error('Escribe tu nombre');
        const tel = celularAnon.replace(/\D/g, '');
        if (tel.length < 6) throw new Error('El celular no es válido');
        const inicio = new Date(`${fecha}T${hora}:00-05:00`).toISOString();
        const { error } = await supabase.rpc('reservar_cita_sin_cuenta', {
          p_barbero: barbero.id, p_servicio: servicio.id, p_inicio: inicio,
          p_nombre: nombreAnon.trim(), p_telefono: tel,
        });
        if (error) throw error;
        sessionStorage.removeItem(BORRADOR);
        return setHecho({ resultado: 'SIN_ADELANTO', precio });
      }
      if (archivo && !sinAdelanto) ruta = (await subirImagen('comprobantes', `${barberia.id}/${user!.id}`, archivo)).ruta;
      const inicio = new Date(`${fecha}T${hora}:00-05:00`).toISOString();
      if (anonimo) {
        if (!ruta) throw new Error('Adjunta la captura de tu Yape/Plin para reservar sin DNI');
        const { error } = await supabase.rpc('reservar_cita_anonima', {
          p_barbero: barbero.id, p_servicio: servicio.id, p_inicio: inicio,
          p_nombre: nombreAnon.trim(), p_comprobante: ruta, p_metodo: metodo,
        });
        if (error) throw error;
        sessionStorage.removeItem(BORRADOR);
        return setHecho({ resultado: 'CON_COMPROBANTE', precio });
      }
      if (!verificado && !sinAdelanto && !ruta) throw new Error('Adjunta la captura de tu Yape/Plin o elige “Ya me conoce el barbero”');
      const { data: citaId, error } = await supabase.rpc('reservar_cita', {
        p_barbero: barbero.id, p_servicio: servicio.id, p_inicio: inicio,
        p_comprobante: ruta, p_metodo: ruta ? metodo : null, p_voucher: voucherId || null,
      });
      if (error) throw error;
      sessionStorage.removeItem(BORRADOR);
      const resultado: Resultado = verificado && !ruta ? 'CONFIRMADA' : ruta ? 'CON_COMPROBANTE' : 'SIN_ADELANTO';
      if (citaId && resultado !== 'SIN_ADELANTO') notificar(resultado === 'CONFIRMADA' ? 'cita_nueva' : 'pago_recibido', citaId);
      setHecho({ resultado, precio });
    } catch (e) { setError(msg(e)); } finally { setEnviando(false); }
  }

  return (
    <div className="grid gap-6">
      {bloqueGuia(etapa, textoGuia)}
      <section className={`grid gap-3 ${foco(2)}`}>
        <h3 className="paso"><span>1</span> Elige tu corte</h3>
        <div className="grid gap-2">
          {servicios.map((s) => {
            const best = datos.barberoServicios.some((x) => x.barbero_id === barbero.id && x.servicio_id === s.id && x.es_bestseller);
            const activo = s.id === servicioId;
            return (
              <button key={s.id} onClick={() => {
                setServicioId(s.id); setHora(undefined); setEligioCorte(true);
                requestAnimationFrame(() => paso2.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
              }} aria-pressed={activo}
                className={`opcion ${activo ? 'opcion-activa' : ''}`}>
                <span className="flex-1 text-left min-w-0">
                  <span className="block font-semibold">{s.nombre} {best && <span className="chip text-amber-400 ml-1">⭐ Más pedido</span>}</span>
                  <span className="text-xs text-base-500 flex items-center gap-1 mt-0.5"><Clock className="size-3" /> {s.duracion_min} min</span>
                </span>
                <b className="text-base tabular-nums">{soles(s.precio_base)}</b>
              </button>
            );
          })}
        </div>
      </section>

      <section ref={paso2} className={`grid gap-3 scroll-mt-40 ${foco(3)}`}>
        <h3 className="paso"><span>2</span> Elige día y hora</h3>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x scrollbar-none">
          {dias.map((d) => {
            const cerrado = !barbero.horario_atencion[String(isoDow(d))];
            const activo = d === fecha;
            return (
              <button key={d} onClick={() => { setFecha(d); setHora(undefined); setEligioCorte(true); }} aria-pressed={activo} disabled={cerrado}
                className={`snap-start shrink-0 w-[4.25rem] rounded-xl py-2.5 text-center border transition-colors disabled:opacity-35 ${activo ? 'bg-acento-500 border-acento-500 text-black' : 'border-[var(--borde)] bg-[var(--tarjeta)]'}`}>
                <span className="block text-[11px] uppercase opacity-80">{d === dias[0] ? 'Hoy' : DIAS[isoDow(d)].slice(0, 3)}</span>
                <span className="block text-lg font-bold">{d.slice(8)}</span>
              </button>
            );
          })}
        </div>
        {cerradoHoy ? <Aviso tipo="info">{barbero.nombre} no atiende este día. Elige otro.</Aviso>
          : !bloques ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-busy="true" aria-label="Buscando horas libres">{Array.from({ length: 12 }, (_, i) => <Esqueleto key={i} className="h-11" />)}</div>
          : bloques.every((b) => !b.libre) ? <Aviso tipo="info">Este día ya está lleno. Prueba mañana.</Aviso>
          : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {bloques.map((b) => (
                <button key={b.hora} disabled={!b.libre} onClick={() => setHora(b.hora)} aria-pressed={b.hora === hora}
                  title={b.motivo}
                  className={`min-h-11 rounded-xl text-sm font-bold tabular-nums border transition-colors disabled:opacity-30 disabled:line-through ${b.hora === hora ? 'bg-acento-500 border-acento-500 text-black' : 'border-[var(--borde)] bg-[var(--tarjeta)] hover:border-acento-500/60'}`}>
                  {b.hora}
                </button>
              ))}
            </div>
          )}
      </section>

      {hora && servicio && (
        <section ref={paso3} className={`grid gap-3 scroll-mt-40 ${foco(4) || foco(5)}`}>
          <h3 className="paso"><span>3</span> Confirma tus datos</h3>
          {cargando ? <Cargando /> : !user && !sinCuenta ? (
            <OpcionesCuenta
              guardar={() => guardarBorrador({ barberoId: barbero.id, servicioId, fecha, hora })}
              onSinCuenta={() => setSinCuenta(true)} />
          ) : user && !cliente && !anonimo ? (
            <Aviso tipo="info">Cargando tu cuenta… Si no aparece, recarga la página.</Aviso>
          ) : (
            <>
              {sinCuenta ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">Reserva sin cuenta</span>
                    <button type="button" onClick={() => setSinCuenta(false)} className="text-xs text-acento-400 underline underline-offset-4">Mejor iniciar sesión</button>
                  </div>
                  <label>
                    <span className="etiqueta">Tu nombre</span>
                    <input value={nombreAnon} onChange={(e) => setNombreAnon(e.target.value)} maxLength={60} autoComplete="name" className="campo" placeholder="Ej. Carlos" />
                  </label>
                  <label>
                    <span className="etiqueta">Tu celular (para que el barbero te confirme)</span>
                    <input value={celularAnon} onChange={(e) => setCelularAnon(e.target.value)} inputMode="tel" autoComplete="tel" pattern="[0-9 +]{6,15}" className="campo" placeholder="9xx xxx xxx" />
                  </label>
                  <span className="text-xs text-base-500">No creas cuenta: no sumas cortes a tu tarjeta de lealtad.</span>
                </div>
              ) : anonimo ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">Reserva anónima · sin DNI</span>
                    <button type="button" onClick={() => setAnonimo(false)} className="text-xs text-acento-400 underline underline-offset-4">Usar mi DNI</button>
                  </div>
                  <label>
                    <span className="etiqueta">Tu nombre (para que el barbero te reconozca)</span>
                    <input value={nombreAnon} onChange={(e) => setNombreAnon(e.target.value)} maxLength={60} autoComplete="name" className="campo" placeholder="Ej. Carlos" />
                  </label>
                  <span className="text-xs text-base-500">No guardamos tu DNI ni sumas cortes a tu tarjeta de lealtad.</span>
                </div>
              ) : (
                <div className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span>{cliente!.nombre} · {cliente!.dni ? `DNI ••••${cliente!.dni.slice(-3)}` : `Cel. ${cliente!.telefono ?? ''}`}</span>
                    <Insignia verificado={verificado} />
                  </div>
                  {!cliente!.dni && <span className="text-xs text-base-500">Puedes añadir tu DNI y correo después desde tu perfil.</span>}
                </div>
              )}

              {vouchers.length > 0 && !anonimo && (
                <label><span className="etiqueta">🎁 Usar voucher</span>
                  <select className="campo" value={voucherId} onChange={(e) => setVoucherId(e.target.value)}>
                    <option value="">No usar</option>
                    {vouchers.map((v) => <option key={v.id} value={v.id}>{v.codigo} · {v.tipo_premio === 'GRATIS' ? 'Corte gratis' : `${v.valor_descuento}% dscto`}</option>)}
                  </select>
                </label>
              )}

              {sinCuenta && (
                <p className="text-xs text-base-500 panel">
                  {barbero.nombre} te confirmará por WhatsApp. Si quieres adelantar con Yape o Plin, envíale el comprobante al mismo WhatsApp — no hace falta subirlo aquí.
                </p>
              )}
              {!sinCuenta && !verificado && !anonimo && (
                <div role="radiogroup" aria-label="Cómo reservar" className="grid gap-2">
                  {([
                    { v: 'ADELANTO', t: 'Pago adelantado', d: `Confirmación inmediata al validar tu Yape o Plin (${soles(precio)}).` },
                    { v: 'CONOCIDO', t: 'Ya me conoce el barbero', d: `Sin pago. ${barbero.nombre} confirma tu cita por WhatsApp.` },
                  ] as const).map((o) => (
                    <button key={o.v} role="radio" aria-checked={modo === o.v} onClick={() => setModo(o.v)} className={`opcion ${modo === o.v ? 'opcion-activa' : ''}`}>
                      <span className="flex-1 text-left">
                        <span className="block font-semibold text-sm">{o.t}</span>
                        <span className="block text-xs text-base-500 mt-0.5">{o.d}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {pideAdelanto && (
                <div className="panel grid gap-3">
                  <p className="text-sm">
                    Envía <b className="tabular-nums">{soles(precio)}</b> a <b>{pago.a}</b>
                  </p>
                  <div className="flex gap-2">
                    {(['YAPE', 'PLIN'] as const).map((m) => (
                      <button key={m} onClick={() => setMetodo(m)} aria-pressed={metodo === m}
                        className={`flex-1 min-h-11 rounded-xl text-sm font-semibold border ${metodo === m ? 'bg-acento-500 border-acento-500 text-white' : 'border-base-700/60'}`}>
                        {m === 'YAPE' ? 'Yape' : 'Plin'}
                      </button>
                    ))}
                  </div>
                  <p className="rounded-xl bg-base-900/60 px-3 py-2.5 text-center text-lg font-bold tabular-nums select-all">
                    {(metodo === 'YAPE' ? pago.yape : pago.plin) || 'Número no configurado: consulta en el local'}
                  </p>
                  {pago.qr && <img src={pago.qr} alt={`QR de pago de ${pago.a}`} className="w-44 rounded-xl mx-auto" loading="lazy" />}
                  <label className="btn cursor-pointer w-full">
                    <Upload className="size-4" /> {archivo ? archivo.name : 'Subir captura del pago'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
                  </label>
                </div>
              )}

              <div className="panel flex items-center justify-between text-sm gap-3">
                <span className="min-w-0">
                  <span className="block font-semibold">{servicio.nombre}</span>
                  <span className="block text-xs text-base-500">{DIAS[isoDow(fecha)]} {fecha.slice(8)} · {hora} con {barbero.nombre}</span>
                </span>
                <b className="text-lg tabular-nums">{soles(precio)}</b>
              </div>
              {error && <Aviso>{error}</Aviso>}
              <button onClick={confirmar} disabled={enviando || !!falta} aria-busy={enviando} className="btn-primario w-full py-3.5">
                {enviando ? <Girando className="size-5" /> : <CalendarCheck className="size-5" />}
                {enviando ? 'Reservando…' : verificado || sinAdelanto ? 'Confirmar cita' : 'Enviar comprobante y reservar'}
              </button>
              {/* Muestra qué falta en vez de un botón gris sin explicación. */}
              {falta && !enviando && <p className="text-center text-xs text-[var(--texto-suave)]">Falta: {falta}</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** Las 3 formas de seguir sin sesión: tarjetas grandes con icono y una línea, para que se entiendan solas. */
function OpcionesCuenta({ guardar, onSinCuenta }: { guardar: () => void; onSinCuenta: () => void }) {
  // Al volver de /acceso, Inicio abre la reserva guardada en el borrador.
  const acceso = (modo: 'crear' | 'entrar') => `/acceso?modo=${modo}&volver=${encodeURIComponent(location.pathname + location.search)}`;
  return (
    <div className="grid gap-3">
      <p className="text-base font-semibold">¿Cómo quieres continuar?</p>
      <a href={acceso('crear')} onClick={guardar} className="opcion opcion-activa !p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-acento-400 text-black"><Smartphone className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-bold">Crear cuenta con mi celular <span className="chip">Recomendado</span></span>
          <span className="mt-0.5 block text-sm text-[var(--texto-suave)]">Es gratis. Guardas tus citas y sumas cortes a tu tarjeta de premios.</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-acento-400" />
      </a>
      <a href={acceso('entrar')} onClick={guardar} className="-mt-1 text-center text-sm text-[var(--texto-suave)] py-1">
        ¿Ya tienes cuenta con celular? <b className="text-acento-400 underline underline-offset-4">Entrar</b>
      </a>
      <div className="flex items-center gap-2 text-xs text-[var(--texto-suave)]"><span className="flex-1 border-t border-[var(--borde)]" />o también<span className="flex-1 border-t border-[var(--borde)]" /></div>
      <BotonGoogle onClick={() => { guardar(); entrarConGoogle(); }} texto="Entrar con Google" />
      <button type="button" onClick={onSinCuenta} className="opcion">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--superficie)]"><UserRound className="size-6" /></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block font-bold">Reservar sin cuenta</span>
          <span className="mt-0.5 block text-sm text-[var(--texto-suave)]">Solo tu nombre y celular. No sumas premios.</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--texto-suave)]" />
      </button>
    </div>
  );
}

function Listo({ barbero, nombre, dni, servicio, precio, fecha, hora, duracion, resultado, onListo }: {
  barbero: Barbero; nombre: string; dni?: string; servicio: string; precio: number; fecha: string; hora: string; duracion: number;
  resultado: Resultado; onListo: () => void;
}) {
  const [avisado, setAvisado] = useState(false);
  const texto = nombre && mensajeWhatsApp({ barbero, nombre, dni, servicio, precio, fecha, hora, resultado });
  const wa = barbero.whatsapp && texto ? `https://wa.me/${barbero.whatsapp}?text=${encodeURIComponent(texto)}` : null;
  return (
    <div className="grid gap-5 text-center py-2">
      <CheckCircle2 className="mx-auto size-14 text-emerald-400" />
      <div>
        <p className="titulo text-xl">¡Último paso!</p>
        <p className="text-sm text-base-400 mt-2">{servicio} con <b className="text-base-100">{barbero.nombre}</b><br />{DIAS[isoDow(fecha)]} {fecha.slice(8)} a las {hora}</p>
      </div>
      <p className="panel text-sm text-left">Envía el mensaje a {barbero.nombre} por WhatsApp. Así confirma tu cita desde su app.</p>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener" onClick={() => setAvisado(true)} className="btn-whatsapp w-full py-3.5">
          <MessageCircle className="size-5" /> Enviar a {barbero.nombre} por WhatsApp
        </a>
      ) : <Aviso>Este barbero aún no tiene WhatsApp. Avísale en el local.</Aviso>}
      <a href="/perfil" aria-disabled={!avisado} className={`btn w-full ${avisado ? '' : 'pointer-events-none opacity-40'}`}>Ver mis citas</a>
      <button onClick={onListo} disabled={!avisado && !!wa} className="text-sm text-base-500 py-2 disabled:opacity-40">Cerrar</button>
    </div>
  );
}
