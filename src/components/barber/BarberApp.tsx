import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Clock, LayoutGrid, Scissors, User, Users } from 'lucide-react';
import { msg, subirImagen, suscribirPush, supabase } from '@/lib/supabase';
import { useBarberia } from '@/lib/useBarberia';
import type { Barbero, EstadoBarbero, Horario } from '@/lib/tipos';
import { ESTADOS, soles } from '@/lib/tipos';
import Agenda, { Walkin } from '../Agenda';
import HoyYManana from './Inicio';
import EditorHorario from '../Horario';
import ClientesPanel from '../ClientesPanel';
import { BotonAccion, Hoja } from '../ui';
import { iniciarAyudaVista } from '@/lib/guia';
import { Aviso, Cargando } from '../ui';

const MODULOS_MAS = [
  { id: 'agenda', t: 'Citas', icono: '📅' },
  { id: 'clientes', t: 'Clientes', icono: '🛡️' },
  { id: 'finanzas', t: 'Finanzas', icono: '💼' },
  { id: 'estadisticas', t: 'Estadísticas', icono: '📊' },
  { id: 'equipo', t: 'Barberos', icono: '👥' },
  { id: 'servicios', t: 'Servicios', icono: '✂️' },
  { id: 'lealtad', t: 'Lealtad', icono: '🎁' },
  { id: 'productos', t: 'Productos', icono: '📦' },
  { id: 'pisos', t: 'Pisos 3D', icono: '🏢' },
  { id: 'local', t: 'Local', icono: '📍' },
  { id: 'festivos', t: 'Festivos', icono: '🎉' },
];

export default function BarberApp() {
  const [yo, setYo] = useState<Barbero | null>(null);
  const [tab, setTab] = useState<'jornada' | 'agenda' | 'perfil' | 'clientes'>('jornada');
  const [masAbierto, setMasAbierto] = useState(false);
  const [nuevoCorte, setNuevoCorte] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return location.replace('/login');
      const { data } = await supabase.from('barberos').select('*').eq('usuario_id', user.id).maybeSingle();
      if (!data) return location.replace('/login');
      setYo(data);
      suscribirPush();
    });
  }, []);

  const { datos, recargar } = useBarberia({ id: yo?.barberia_id });
  // Mi fila en vivo: el estado que ven los clientes llega por el mismo canal Realtime.
  const vivo = datos?.barberos.find((b) => b.id === yo?.id) ?? yo;

  if (!yo || !datos || !vivo) return <Cargando texto="Abriendo tu jornada…" />;
  if (vivo.debe_cambiar_clave) return <CambiarClave onListo={() => { setYo({ ...yo, debe_cambiar_clave: false }); recargar(); }} />;

  const { barberia } = datos;
  const tieneAdmin = !!vivo.es_admin || (vivo.permisos?.length ?? 0) > 0;
  async function cerrarSesion() {
    await supabase.auth.signOut();
    location.replace('/login');
  }
  return (
    <div data-vista={tab} className="grid gap-5 max-w-3xl mx-auto pb-28 sm:pb-0">
      <header className="flex items-center gap-3">
        {/* Tocar la foto o las iniciales abre "Mi perfil" para cambiar foto y datos. */}
        <button type="button" onClick={() => setTab('perfil')} aria-label="Editar mi perfil" className="shrink-0 rounded-full ring-2 ring-transparent hover:ring-acento-500/60 transition">
          {vivo.avatar_url ? <img src={vivo.avatar_url} alt="" className="size-12 rounded-full object-cover" />
            : <span className="grid size-12 place-items-center rounded-full bg-acento-500 font-bold text-black">{vivo.nombre.slice(0, 2).toUpperCase()}</span>}
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="titulo text-lg">Hola, {vivo.nombre.split(' ')[0]} ✂️</h1>
          <p className="text-xs text-base-500 truncate">{barberia.nombre} · {barberia.codigo} · cola actual: <b>{vivo.cola}</b></p>
        </div>
        <button type="button" onClick={cerrarSesion} className="btn !py-1.5 text-xs shrink-0">Cerrar sesión</button>
      </header>
      <div className="flex justify-end -mb-2">
        <button type="button" onClick={() => iniciarAyudaVista(tab)} className="btn !py-1.5 text-xs">❔ Ayuda de esta sección</button>
      </div>
      <nav aria-label="Secciones" className="neu-inset rounded-2xl p-1 grid grid-cols-5 gap-1 text-sm fixed inset-x-3 bottom-3 z-40 bg-[var(--superficie)] shadow-lg sm:static sm:inset-auto sm:z-auto sm:shadow-none">
        {([['jornada', 'Inicio', Clock], ['agenda', 'Citas', CalendarDays]] as const).map(([id, t, I]) => (
          <button key={id} onClick={() => setTab(id)} data-guia={`tab-${id}`} aria-pressed={tab === id}
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-xs font-semibold text-[var(--texto-suave)] aria-pressed:bg-acento-500/15 aria-pressed:text-acento-400">
            <I className="size-5" />{t}
          </button>
        ))}
        <button type="button" onClick={() => setNuevoCorte(true)} data-guia="nuevo-corte" aria-label="Nuevo corte sin cita"
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-xs font-bold text-acento-400">
          <span className="-mt-5 grid size-12 place-items-center rounded-full bg-red-800 text-white shadow-lg"><Scissors className="size-6" /></span>
          Corte
        </button>
        <button onClick={() => setTab('clientes')} data-guia="tab-clientes" aria-pressed={tab === 'clientes'}
          className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-xs font-semibold text-[var(--texto-suave)] aria-pressed:bg-acento-500/15 aria-pressed:text-acento-400">
          <Users className="size-5" />Clientes
        </button>
        {tieneAdmin ? (
          <button type="button" onClick={() => setMasAbierto(true)} aria-label="Más opciones"
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-xs font-semibold text-[var(--texto-suave)]">
            <LayoutGrid className="size-5" />Más
          </button>
        ) : (
          <button onClick={() => setTab('perfil')} data-guia="tab-perfil" aria-pressed={tab === 'perfil'}
            className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-xs font-semibold text-[var(--texto-suave)] aria-pressed:bg-acento-500/15 aria-pressed:text-acento-400">
            <User className="size-5" />Mi perfil
          </button>
        )}
      </nav>
      <Hoja abierta={masAbierto} onClose={() => setMasAbierto(false)} titulo="Más opciones">
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => { setMasAbierto(false); setTab('perfil'); }}
            className="grid min-h-24 place-items-center gap-1 rounded-2xl border border-[var(--borde)] bg-[var(--tarjeta)] p-2 text-center text-sm font-semibold">
            <span className="text-2xl" aria-hidden="true">👤</span>Mi perfil
          </button>
          {MODULOS_MAS.filter((m) => vivo.es_admin || (vivo.permisos ?? []).includes(m.id)).map((m) => (
            <a key={m.id} href={`/admin#${m.id}`}
              className="grid min-h-24 place-items-center gap-1 rounded-2xl border border-acento-500/60 bg-acento-500/5 p-2 text-center text-sm font-semibold">
              <span className="text-2xl" aria-hidden="true">{m.icono}</span>{m.t}
            </a>
          ))}
        </div>
      </Hoja>
      <Hoja abierta={nuevoCorte} onClose={() => setNuevoCorte(false)} titulo="Nuevo corte (sin cita)">
        <Walkin barberiaId={vivo.barberia_id} barberos={[vivo]} servicios={datos.servicios}
          onListo={() => { setNuevoCorte(false); setTab('jornada'); }} />
      </Hoja>
      {tab === 'jornada' && (
        <>
          <Estado yo={vivo} />
          <HoyYManana barberoId={vivo.id} cola={vivo.cola} onVerCitas={() => setTab('agenda')} />
        </>
      )}
      {tab === 'agenda' && (
        <Agenda barberia={barberia} barberos={datos.barberos} servicios={datos.servicios} soloBarbero={vivo.id}
          // En modo INDIVIDUAL el dinero es suyo: él valida sus comprobantes.
          puedeValidar={(c) => barberia.modo_financiero === 'INDIVIDUAL' && c.barbero_id === vivo.id} />
      )}
      {tab === 'clientes' && <ClientesPanel barberiaId={vivo.barberia_id} />}
      {tab === 'perfil' && <Perfil yo={vivo} datos={datos} recargar={recargar} />}
    </div>
  );
}

/** Cambio de estado en 1 tap. Supabase Realtime lo lleva a la vista 3D de los clientes. */
function Estado({ yo }: { yo: Barbero }) {
  const [minutos, setMinutos] = useState(30);
  const [error, setError] = useState('');
  const [cola, setCola] = useState<{ id: string; nombre_walkin: string | null; servicios_cortes: { nombre: string } | null }[]>([]);
  async function cargarCola() {
    const { data } = await supabase.from('citas').select('id, nombre_walkin, servicios_cortes(nombre)')
      .eq('barbero_id', yo.id).eq('estado', 'EN_COLA').eq('tipo', 'WALKIN').order('fecha_hora').limit(20);
    setCola((data ?? []) as unknown as typeof cola);
  }
  useEffect(() => { cargarCola(); }, [yo.id, yo.cola]);
  async function empezar(id: string) {
    setError('');
    const { error } = await supabase.rpc('iniciar_cita', { p_cita: id });
    if (error) setError(msg(error)); else cargarCola();
  }
  async function presencia(presente: boolean) {
    setError('');
    const { error } = await supabase.rpc('marcar_presencia', { p_barbero: yo.id, p_presente: presente });
    if (error) setError(msg(error));
  }
  // Respuesta inmediata: el botón cambia al tocarlo y el realtime solo confirma (o deshace si falla).
  const [pedido, setPedido] = useState<EstadoBarbero | null>(null);
  useEffect(() => setPedido(null), [yo.estado]);
  async function cambiar(e: EstadoBarbero) {
    setError('');
    if ('vibrate' in navigator) navigator.vibrate(30);
    setPedido(e);
    const { error } = await supabase.rpc('barbero_set_estado', { p_estado: e, p_minutos: minutos });
    if (error) { setError(msg(error)); setPedido(null); }
  }
  return (
    <section className="grid gap-4">
      <div data-guia="llegada" className="panel flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          {yo.presente ? 'Estás en el local. Tus clientes te ven en su silla.' : 'Aún no llegas. Tu silla aparece vacía para los clientes.'}
        </span>
        <BotonAccion className={yo.presente ? 'btn' : 'btn-acento'} onClick={() => presencia(!yo.presente)}>
          {yo.presente ? 'Me retiro' : 'Llegué al local'}
        </BotonAccion>
      </div>
      {cola.length > 0 && (
        <div data-guia="cola" className="panel grid gap-3 border-acento-500/60">
          <p className="text-sm font-semibold">En cola: {cola.length} {cola.length === 1 ? 'persona' : 'personas'}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-sm">
              <span className="block font-bold truncate">{cola[0].nombre_walkin || 'Cliente sin cita'}</span>
              <span className="block text-xs text-[var(--texto-suave)]">{cola[0].servicios_cortes?.nombre ?? 'Corte'}</span>
            </span>
            <BotonAccion className="btn-acento shrink-0" onClick={() => empezar(cola[0].id)}>Empezar</BotonAccion>
          </div>
        </div>
      )}
      <div data-guia="estado" className="grid grid-cols-2 gap-3">
        {(Object.keys(ESTADOS) as EstadoBarbero[]).map((e) => {
          const s = ESTADOS[e], activo = (pedido ?? yo.estado) === e;
          return (
            <motion.button key={e} whileTap={{ scale: 0.94 }} onClick={() => cambiar(e)} aria-pressed={activo}
              className={`rounded-3xl p-5 min-h-32 grid place-items-center text-center gap-1 ${activo ? 'neu-inset ring-4' : 'neu'}`}
              style={activo ? { boxShadow: `0 0 0 3px ${s.color}` } : undefined}>
              <span className="text-4xl">{s.emoji}</span>
              <span className="font-semibold text-sm uppercase tracking-wide" style={{ color: activo ? s.color : undefined }}>{s.texto}</span>
            </motion.button>
          );
        })}
      </div>
      <label className="text-sm flex items-center gap-2 justify-center">⏱️ Tiempo estimado del corte
        <input type="number" min={5} max={240} step={5} value={minutos} onChange={(e) => setMinutos(+e.target.value)} className="campo !w-20 !py-1" /> min
      </label>
      {error && <Aviso>{error}</Aviso>}
      <p className="text-xs text-base-400 text-center">Los clientes ven tu cambio al instante en el mapa 3D. Para citas usa “Iniciar” en la pestaña Citas: el timer se ajusta solo.</p>
    </section>
  );
}

function CambiarClave({ onListo }: { onListo: () => void }) {
  const [error, setError] = useState('');
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const a = String(f.get('a')), b = String(f.get('b'));
    if (a !== b) return setError('Las claves no coinciden');
    if (a.length < 6) return setError('Usa al menos 6 caracteres');
    const { error } = await supabase.auth.updateUser({ password: a });
    // Si el barbero decide dejar la misma clave, el servidor la rechaza: la decisión es suya, así que se acepta.
    if (error && !/different from the old password|debe ser diferente|diferente de la anterior/i.test(error.message)) return setError(msg(error));
    await supabase.rpc('clave_cambiada');
    onListo();
  }
  return (
    <form onSubmit={enviar} className="max-w-sm mx-auto neu rounded-3xl p-6 grid gap-3">
      <h1 className="titulo text-xl">🔐 Crea tu clave personal</h1>
      <p className="text-sm text-base-500">Por seguridad, la clave temporal que te dio el dueño solo sirve para este primer ingreso.</p>
      <label><span className="etiqueta">Nueva clave</span><input name="a" type="password" required minLength={6} autoComplete="new-password" className="campo" /></label>
      <label><span className="etiqueta">Repítela</span><input name="b" type="password" required minLength={6} autoComplete="new-password" className="campo" /></label>
      {error && <Aviso>{error}</Aviso>}
      <button className="btn-acento">Guardar y entrar</button>
    </form>
  );
}

function Perfil({ yo, datos, recargar }: { yo: Barbero; datos: NonNullable<ReturnType<typeof useBarberia>['datos']>; recargar: () => void }) {
  const [horario, setHorario] = useState<Horario>(yo.horario_atencion);
  const [bio, setBio] = useState(yo.bio ?? '');
  const [espSel, setEspSel] = useState<string[]>(yo.especialidades_bestseller);
  const [yape, setYape] = useState(yo.yape_numero ?? '');
  const [plin, setPlin] = useState(yo.plin_numero ?? '');
  const [emailReal, setEmailReal] = useState(yo.email_real ?? '');
  const [telReal, setTelReal] = useState(yo.telefono_real ?? '');
  const [wa, setWa] = useState(yo.whatsapp ?? '');
  const [avatar, setAvatar] = useState(yo.avatar_url ?? '');
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const mios = datos.barberoServicios.filter((x) => x.barbero_id === yo.id);

  async function guardar() {
    setError(''); setOk('');
    const { error } = await supabase.rpc('barbero_actualizar_perfil', {
      p_avatar: avatar || null, p_bio: bio, p_horario: horario,
      p_especialidades: espSel.slice(0, 8), p_yape: yape || null, p_plin: plin || null,
      p_email_real: emailReal || null, p_telefono_real: telReal || null, p_whatsapp: wa || null,
    });
    if (error) setError(msg(error)); else { setOk('Perfil guardado ✅'); recargar(); }
  }
  async function servicio(id: string, cambio: 'importar' | 'quitar' | 'best') {
    const q = supabase.from('barbero_servicios');
    const actual = mios.find((x) => x.servicio_id === id);
    const { error } = cambio === 'quitar' ? await q.delete().eq('barbero_id', yo.id).eq('servicio_id', id)
      : await q.upsert({ barbero_id: yo.id, servicio_id: id, es_bestseller: cambio === 'best' ? !actual?.es_bestseller : actual?.es_bestseller ?? false });
    if (error) setError(msg(error)); else recargar();
  }
  async function foto(f?: File) {
    if (!f) return;
    try { setAvatar((await subirImagen('publico', `${yo.barberia_id}/avatares`, f)).url); } catch (e) { setError(msg(e)); }
  }

  return (
    <div className="grid gap-5">
      <section data-ayuda="perfil-datos" className="neu rounded-2xl p-4 grid gap-3">
        <div className="flex items-center gap-3">
          {avatar ? <img src={avatar} alt="" className="size-16 rounded-full object-cover" /> : <span className="size-16 rounded-full neu-inset grid place-items-center">📷</span>}
          <label className="btn cursor-pointer text-xs">Cambiar foto<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => foto(e.target.files?.[0])} /></label>
        </div>
        <label><span className="etiqueta">Sobre mí</span><textarea className="campo" rows={2} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} /></label>
        <div className="grid gap-1.5">
          <span className="etiqueta">Especialidades: toca los cortes que haces</span>
          <div className="flex flex-wrap gap-1.5">
            {datos.servicios.map((s) => {
              const on = espSel.includes(s.nombre);
              return (
                <button key={s.id} type="button" aria-pressed={on}
                  onClick={() => setEspSel(on ? espSel.filter((n) => n !== s.nombre) : [...espSel, s.nombre].slice(0, 8))}
                  className={`min-h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${on ? 'border-acento-500 bg-acento-500 text-black' : 'border-[var(--borde)] bg-[var(--tarjeta)]'}`}>
                  {on ? '✓ ' : ''}{s.nombre}
                </button>
              );
            })}
          </div>
          {datos.servicios.length === 0 && <span className="text-xs text-[var(--texto-suave)]">La barbería aún no tiene servicios cargados.</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label><span className="etiqueta">Email (notificaciones)</span><input className="campo" type="email" value={emailReal} onChange={(e) => setEmailReal(e.target.value)} placeholder="tu@gmail.com" /></label>
          <label><span className="etiqueta">Teléfono</span><input className="campo" inputMode="tel" value={telReal} onChange={(e) => setTelReal(e.target.value)} placeholder="987654321" /></label>
          <label><span className="etiqueta">WhatsApp</span><input className="campo" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="51987654321" /></label>
        </div>
        {datos.barberia.modo_financiero === 'INDIVIDUAL' && (
          <div className="grid grid-cols-2 gap-3">
            <label><span className="etiqueta">Mi Yape</span><input className="campo" inputMode="tel" value={yape} onChange={(e) => setYape(e.target.value)} /></label>
            <label><span className="etiqueta">Mi Plin</span><input className="campo" inputMode="tel" value={plin} onChange={(e) => setPlin(e.target.value)} /></label>
          </div>
        )}
      </section>
      <section data-ayuda="perfil-horario" className="neu rounded-2xl p-4 grid gap-3">
        <h3 className="titulo">🕘 Mi horario de atención</h3>
        <EditorHorario valor={horario} onChange={setHorario} />
      </section>
      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      <button className="btn-acento" onClick={guardar}>Guardar perfil</button>

      <section data-ayuda="perfil-servicios" className="neu rounded-2xl p-4 grid gap-2">
        <h3 className="titulo">✂️ Mis servicios</h3>
        <p className="text-xs text-base-500">Importa los cortes del catálogo de la barbería y marca tus ⭐ best sellers (se destacan en tu ficha).</p>
        {datos.servicios.map((s) => {
          const m = mios.find((x) => x.servicio_id === s.id);
          return (
            <div key={s.id} className="flex items-center gap-2 neu-sm rounded-xl px-3 py-2">
              <span className="flex-1 text-sm">{s.nombre} <span className="text-xs text-base-500">· {soles(s.precio_base)} · {s.duracion_min} min</span></span>
              {m ? <>
                <button className="btn !py-1 text-xs" aria-pressed={m.es_bestseller} onClick={() => servicio(s.id, 'best')}>{m.es_bestseller ? '⭐ Best seller' : '☆ Destacar'}</button>
                <button className="btn !py-1 text-xs" onClick={() => servicio(s.id, 'quitar')}>Quitar</button>
              </> : <button className="btn-acento !py-1 text-xs" onClick={() => servicio(s.id, 'importar')}>Importar</button>}
            </div>
          );
        })}
      </section>
    </div>
  );
}
