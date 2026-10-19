import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { msg, subirImagen, supabase } from '@/lib/supabase';
import { useBarberia } from '@/lib/useBarberia';
import type { Barbero, EstadoBarbero, Horario } from '@/lib/tipos';
import { ESTADOS, soles } from '@/lib/tipos';
import Agenda from '../Agenda';
import EditorHorario from '../Horario';
import VerificarDni from '../VerificarDni';
import { Aviso, Cargando } from '../ui';

export default function BarberApp() {
  const [yo, setYo] = useState<Barbero | null>(null);
  const [tab, setTab] = useState<'jornada' | 'agenda' | 'perfil' | 'clientes'>('jornada');

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return location.replace('/login');
      const { data } = await supabase.from('barberos').select('*').eq('usuario_id', user.id).maybeSingle();
      if (!data) return location.replace('/login');
      setYo(data);
    });
  }, []);

  const { datos, recargar } = useBarberia({ id: yo?.barberia_id });
  // Mi fila en vivo: el estado que ven los clientes llega por el mismo canal Realtime.
  const vivo = datos?.barberos.find((b) => b.id === yo?.id) ?? yo;

  if (!yo || !datos || !vivo) return <Cargando texto="Abriendo tu jornada…" />;
  if (vivo.debe_cambiar_clave) return <CambiarClave onListo={() => { setYo({ ...yo, debe_cambiar_clave: false }); recargar(); }} />;

  const { barberia } = datos;
  return (
    <div className="grid gap-5 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        {vivo.avatar_url ? <img src={vivo.avatar_url} alt="" className="size-12 rounded-full object-cover" />
          : <span className="size-12 rounded-full grid place-items-center bg-acento-500 text-white font-bold">{vivo.nombre.slice(0, 2).toUpperCase()}</span>}
        <div className="flex-1">
          <h1 className="titulo text-lg">Hola, {vivo.nombre.split(' ')[0]} ✂️</h1>
          <p className="text-xs text-base-500">{barberia.nombre} · {barberia.codigo} · cola actual: <b>{vivo.cola}</b></p>
        </div>
      </header>
      <nav className="neu-inset rounded-2xl p-1 grid grid-cols-4 gap-1 text-sm">
        {([['jornada', 'Jornada'], ['agenda', 'Citas'], ['clientes', 'Clientes'], ['perfil', 'Mi perfil']] as const).map(([id, t]) => (
          <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id} className="py-2 rounded-xl aria-pressed:neu-sm aria-pressed:text-acento-500">{t}</button>
        ))}
      </nav>
      {tab === 'jornada' && <Estado yo={vivo} />}
      {tab === 'agenda' && (
        <Agenda barberia={barberia} barberos={datos.barberos} servicios={datos.servicios} soloBarbero={vivo.id}
          // En modo INDIVIDUAL el dinero es suyo: él valida sus comprobantes.
          puedeValidar={(c) => barberia.modo_financiero === 'INDIVIDUAL' && c.barbero_id === vivo.id} />
      )}
      {tab === 'clientes' && <VerificarDni />}
      {tab === 'perfil' && <Perfil yo={vivo} datos={datos} recargar={recargar} />}
    </div>
  );
}

/** Cambio de estado en 1 tap. Supabase Realtime lo lleva a la vista 3D de los clientes. */
function Estado({ yo }: { yo: Barbero }) {
  const [minutos, setMinutos] = useState(30);
  const [error, setError] = useState('');
  async function cambiar(e: EstadoBarbero) {
    setError('');
    if ('vibrate' in navigator) navigator.vibrate(30);
    const { error } = await supabase.rpc('barbero_set_estado', { p_estado: e, p_minutos: minutos });
    if (error) setError(msg(error));
  }
  return (
    <section className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(ESTADOS) as EstadoBarbero[]).map((e) => {
          const s = ESTADOS[e], activo = yo.estado === e;
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
    if (a.length < 10 || !/\d/.test(a) || !/[a-zA-Z]/.test(a)) return setError('Usa 10+ caracteres con letras y números');
    const { error } = await supabase.auth.updateUser({ password: a });
    if (error) return setError(msg(error));
    await supabase.rpc('clave_cambiada');
    onListo();
  }
  return (
    <form onSubmit={enviar} className="max-w-sm mx-auto neu rounded-3xl p-6 grid gap-3">
      <h1 className="titulo text-xl">🔐 Crea tu clave personal</h1>
      <p className="text-sm text-base-500">Por seguridad, la clave temporal que te dio el dueño solo sirve para este primer ingreso.</p>
      <label><span className="etiqueta">Nueva clave</span><input name="a" type="password" required minLength={10} autoComplete="new-password" className="campo" /></label>
      <label><span className="etiqueta">Repítela</span><input name="b" type="password" required minLength={10} autoComplete="new-password" className="campo" /></label>
      {error && <Aviso>{error}</Aviso>}
      <button className="btn-acento">Guardar y entrar</button>
    </form>
  );
}

function Perfil({ yo, datos, recargar }: { yo: Barbero; datos: NonNullable<ReturnType<typeof useBarberia>['datos']>; recargar: () => void }) {
  const [horario, setHorario] = useState<Horario>(yo.horario_atencion);
  const [bio, setBio] = useState(yo.bio ?? '');
  const [esp, setEsp] = useState(yo.especialidades_bestseller.join(', '));
  const [yape, setYape] = useState(yo.yape_numero ?? '');
  const [plin, setPlin] = useState(yo.plin_numero ?? '');
  const [avatar, setAvatar] = useState(yo.avatar_url ?? '');
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  const mios = datos.barberoServicios.filter((x) => x.barbero_id === yo.id);

  async function guardar() {
    setError(''); setOk('');
    const { error } = await supabase.rpc('barbero_actualizar_perfil', {
      p_avatar: avatar || null, p_bio: bio, p_horario: horario,
      p_especialidades: esp.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8), p_yape: yape || null, p_plin: plin || null,
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
      <section className="neu rounded-2xl p-4 grid gap-3">
        <div className="flex items-center gap-3">
          {avatar ? <img src={avatar} alt="" className="size-16 rounded-full object-cover" /> : <span className="size-16 rounded-full neu-inset grid place-items-center">📷</span>}
          <label className="btn cursor-pointer text-xs">Cambiar foto<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => foto(e.target.files?.[0])} /></label>
        </div>
        <label><span className="etiqueta">Sobre mí</span><textarea className="campo" rows={2} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} /></label>
        <label><span className="etiqueta">Especialidades (separadas por coma)</span><input className="campo" value={esp} onChange={(e) => setEsp(e.target.value)} placeholder="Fade, Diseños, Barba con toalla caliente" /></label>
        {datos.barberia.modo_financiero === 'INDIVIDUAL' && (
          <div className="grid grid-cols-2 gap-3">
            <label><span className="etiqueta">Mi Yape</span><input className="campo" inputMode="tel" value={yape} onChange={(e) => setYape(e.target.value)} /></label>
            <label><span className="etiqueta">Mi Plin</span><input className="campo" inputMode="tel" value={plin} onChange={(e) => setPlin(e.target.value)} /></label>
          </div>
        )}
      </section>
      <section className="neu rounded-2xl p-4 grid gap-3">
        <h3 className="titulo">🕘 Mi horario de atención</h3>
        <EditorHorario valor={horario} onChange={setHorario} />
      </section>
      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      <button className="btn-acento" onClick={guardar}>Guardar perfil</button>

      <section className="neu rounded-2xl p-4 grid gap-2">
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
