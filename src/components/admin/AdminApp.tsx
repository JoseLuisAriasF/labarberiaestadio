import { useEffect, useState } from 'react';
import { BarChart3, CalendarDays, CircleHelp, Gift, LayoutGrid, LogOut, MapPin, Menu, Moon, Package, PartyPopper, Scissors, ShieldCheck, Sun, UserCheck, Users, Wallet, X } from 'lucide-react';
import { msg, supabase } from '@/lib/supabase';
import BarberApp from '../barber/BarberApp';
import { iniciarGuia } from '@/lib/guia';
import { useBarberia } from '@/lib/useBarberia';
import type { Premio, Producto, Servicio } from '@/lib/tipos';
import { soles } from '@/lib/tipos';
import Agenda from '../Agenda';
import ClientesPanel from '../ClientesPanel';
import { Aviso, Cargando, Hoja } from '../ui';
import { AYUDA } from '@/lib/ayuda';
import Crud from './Crud';
import Equipo from './Equipo';
import Estadisticas from './Estadisticas';
import Finanzas from './Finanzas';
import Local from './Local';
import Pisos from './Pisos';
import Festivos from './Festivos';

const PRINCIPALES = ['agenda', 'clientes', 'finanzas', 'equipo'];

const TABS = [
  { id: 'agenda', t: 'Citas', I: CalendarDays },
  { id: 'equipo', t: 'Barberos', I: Users },
  { id: 'servicios', t: 'Servicios', I: Scissors },
  { id: 'pisos', t: 'Pisos 3D', I: LayoutGrid },
  { id: 'clientes', t: 'Clientes', I: ShieldCheck },
  { id: 'lealtad', t: 'Lealtad', I: Gift },
  { id: 'productos', t: 'Productos', I: Package },
  { id: 'finanzas', t: 'Finanzas', I: Wallet },
  { id: 'estadisticas', t: 'Estadísticas', I: BarChart3 },
  { id: 'mijornada', t: 'Mi jornada', I: UserCheck },
  { id: 'local', t: 'Local', I: MapPin },
  { id: 'festivos', t: 'Festivos', I: PartyPopper },
] as const;
type Tab = (typeof TABS)[number]['id'];

/** Qué permiso de módulo abre cada sección (Mi jornada no pide ninguno). */
const MODULO_DE: Partial<Record<Tab, string>> = {
  agenda: 'agenda', equipo: 'equipo', servicios: 'servicios', pisos: 'pisos', clientes: 'clientes', lealtad: 'lealtad',
  productos: 'productos', finanzas: 'finanzas', estadisticas: 'estadisticas', local: 'local', festivos: 'festivos',
};
/** Claro u oscuro: el mismo interruptor que la web pública (clave be:tema). */
function AlternarTema() {
  const [oscuro, setOscuro] = useState(() => document.documentElement.classList.contains('dark'));
  function cambiar() {
    const nuevo = !oscuro;
    setOscuro(nuevo);
    try { localStorage.setItem('be:tema', nuevo ? 'dark' : 'light'); } catch { /* sin almacenamiento */ }
    document.documentElement.dataset.tema = nuevo ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', nuevo);
  }
  return (
    <button type="button" onClick={cambiar} aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="grid size-10 place-items-center rounded-lg text-white hover:bg-white/10">
      {oscuro ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

type Acceso = string[] | 'todos' | null;
const accesoA = (id: Tab, p: Acceso) => {
  if (p === null) return false;
  if (p === 'todos') return true;
  const m = MODULO_DE[id];
  return !m || p.includes(m);
};

export default function AdminApp() {
  const [barberiaId, setBarberiaId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'agenda');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  // Dueño: todo. Administrador delegado o barbero con módulos: solo lo que le dio el dueño.
  const [esDueno, setEsDueno] = useState(true);
  const [permitidos, setPermitidos] = useState<Acceso>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return location.replace('/login');
      const { data } = await supabase.from('barberias').select('id').eq('owner_id', user.id).maybeSingle();
      if (data) {
        setBarberiaId(data.id); setUserId(user.id); setEsDueno(true); setPermitidos('todos');
        return;
      }
      const { data: yo } = await supabase.from('barberos').select('barberia_id, es_admin, permisos')
        .eq('usuario_id', user.id).eq('activo', true).maybeSingle();
      const modulos = (yo?.permisos ?? []) as string[];
      if (!yo || (!yo.es_admin && modulos.length === 0)) return location.replace('/login');
      setBarberiaId(yo.barberia_id); setUserId(user.id); setEsDueno(false);
      setPermitidos(yo.es_admin ? 'todos' : modulos);
    });
  }, []);
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);
  // Si la sección abierta no es suya (o viene del hash), salta a la primera que sí lo es.
  useEffect(() => {
    if (permitidos && !accesoA(tab, permitidos)) {
      const primera = TABS.find((t) => accesoA(t.id, permitidos));
      if (primera) setTab(primera.id);
    }
  }, [permitidos]);
  const visibles = TABS.filter((t) => accesoA(t.id, permitidos));

  const { datos, recargar } = useBarberia({ id: barberiaId ?? undefined });
  if (!barberiaId || !datos) return <Cargando texto="Abriendo tu panel…" />;
  const { barberia } = datos;
  const dias = Math.ceil((Date.parse(barberia.trial_ends_at) - Date.now()) / 864e5);

  function ir(id: Tab) { setTab(id); setMenuAbierto(false); }

  const sidebar = (
    <>
      <div className="p-5 border-b border-white/5">
        <p className="text-base font-bold text-white truncate">💈 {barberia.nombre}</p>
        <p className="text-xs text-gray-400 mt-0.5">Código <b className="text-acento-400">{barberia.codigo}</b></p>
        <a href={`/?b=${barberia.codigo}`} target="_blank" className="text-xs text-acento-400 hover:text-acento-300 mt-1 inline-block">Ver web pública ↗</a>
      </div>
      <div className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {visibles.map(({ id, t, I }) => (
          <button key={id} onClick={() => ir(id)} data-guia={`tab-${id}`} aria-current={tab === id ? 'page' : undefined}
            className="w-full rounded-lg px-3 py-2.5 text-sm flex items-center gap-3 text-gray-400 hover:text-white hover:bg-white/5 transition-colors aria-[current=page]:bg-acento-500/15 aria-[current=page]:text-acento-400 aria-[current=page]:font-semibold">
            <I className="size-4 shrink-0" /> {t}
          </button>
        ))}
      </div>
      <div className="p-3 border-t border-white/5">
        <button onClick={() => setAyuda(true)} className="w-full rounded-lg px-3 py-2 text-sm flex items-center gap-3 text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
          ❔ Ayuda de esta sección
        </button>
        <button onClick={() => iniciarGuia('admin')} className="w-full rounded-lg px-3 py-2 text-sm flex items-center gap-3 text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
          ¿Cómo uso el panel?
        </button>
        <button onClick={() => supabase.auth.signOut().then(() => location.replace('/login'))}
          className="w-full rounded-lg px-3 py-2 text-sm flex items-center gap-3 text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors">
          <LogOut className="size-4" /> Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] -mx-4 sm:-mx-6">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 sticky top-0 h-dvh bg-gradient-to-b from-[#0a0a1a] to-[#12122a] border-r border-white/5">
        {sidebar}
      </aside>

      {/* Mobile header + overlay */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-[#0a0a1a]/95 backdrop-blur-sm border-b border-white/5 flex items-center px-4 gap-3">
        <button onClick={() => setMenuAbierto(!menuAbierto)} className="text-white p-1">
          {menuAbierto ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <span className="text-sm font-semibold text-white truncate">{barberia.nombre}</span>
        <div className="ml-auto flex items-center gap-1">
          <AlternarTema />
          <button type="button" onClick={() => setAyuda(true)} aria-label="Ayuda de esta sección"
            className="grid size-10 place-items-center rounded-lg text-white hover:bg-white/10">
            <CircleHelp className="size-5" />
          </button>
        </div>
      </div>
      {menuAbierto && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMenuAbierto(false)} />
          <aside className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-64 flex flex-col bg-gradient-to-b from-[#0a0a1a] to-[#12122a] shadow-2xl">
            {sidebar}
          </aside>
        </>
      )}

      {/* Navegación inferior: pulgar a la mano en celular; "Más" abre el menú completo */}
      <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-[#0a0a1a]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {visibles.filter((t) => PRINCIPALES.includes(t.id)).map(({ id, t, I }) => (
          <button key={id} onClick={() => ir(id)} aria-current={tab === id ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${tab === id ? 'text-acento-400' : 'text-gray-400'}`}>
            <I className="size-5" />{t}
          </button>
        ))}
        <button onClick={() => setMenuAbierto(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-gray-400">
          <Menu className="size-5" />Más
        </button>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 lg:px-6 px-4 py-4 pb-24 lg:py-6 lg:pb-6 lg:mt-0 mt-14">
        <div className="w-full grid gap-4">
          {barberia.plan === 'TRIAL' && (
            <Aviso tipo={dias > 7 ? 'info' : 'error'}>
              {dias > 0 ? `🎁 Periodo de prueba: te quedan ${dias} días gratis (hasta el ${new Date(barberia.trial_ends_at).toLocaleDateString('es-PE')}).`
                : '⛔ Tu prueba terminó: las reservas online están pausadas. Escríbenos para activar tu plan.'}
            </Aviso>
          )}

          {tab === 'agenda' && (
            <Agenda barberia={barberia} barberos={datos.barberos} servicios={datos.servicios}
              puedeValidar={() => true} />
          )}
          {tab === 'equipo' && <Equipo datos={datos} recargar={recargar} esDueno={esDueno} />}
          {tab === 'servicios' && (
            <Crud<Servicio> tabla="servicios_cortes" barberiaId={barberia.id} titulo="Catálogo de cortes y servicios" orden="precio_base"
              campos={[
                { k: 'nombre', t: 'Nombre', req: true }, { k: 'descripcion', t: 'Descripción', tipo: 'textarea' },
                { k: 'precio_base', t: 'Precio base (S/)', tipo: 'number', req: true, min: 0, paso: 0.5 },
                { k: 'duracion_min', t: 'Duración (minutos)', tipo: 'number', req: true, min: 5, max: 480, paso: 5 },
                { k: 'foto_url', t: 'Foto referencial', tipo: 'imagen' }, { k: 'activo', t: 'Visible para clientes', tipo: 'bool' },
              ]}
              columnas={(s) => (
                <span className="flex items-center gap-3">
                  {s.foto_url && <img src={s.foto_url} alt="" className="size-10 rounded-lg object-cover" />}
                  <span><b className="text-sm">{s.nombre}</b> <span className="text-xs text-base-500">· {s.duracion_min} min · {soles(s.precio_base)}{!s.activo && ' · oculto'}</span></span>
                </span>
              )} />
          )}
          {tab === 'pisos' && <Pisos datos={datos} recargar={recargar} />}
          {tab === 'clientes' && <ClientesPanel barberiaId={barberia.id} />}
          {tab === 'lealtad' && <Lealtad datos={datos} recargar={recargar} />}
          {tab === 'productos' && (
            <Crud<Producto> tabla="productos" barberiaId={barberia.id} titulo="Productos a la venta"
              campos={[
                { k: 'nombre', t: 'Nombre', req: true }, { k: 'categoria', t: 'Categoría (Ceras, Aceites, Champús…)' },
                { k: 'descripcion', t: 'Descripción', tipo: 'textarea' },
                { k: 'precio', t: 'Precio (S/)', tipo: 'number', req: true, min: 0, paso: 0.5 },
                { k: 'stock', t: 'Stock', tipo: 'number', req: true, min: 0 },
                { k: 'imagen_url', t: 'Imagen', tipo: 'imagen' }, { k: 'activo', t: 'Publicado', tipo: 'bool' },
              ]}
              columnas={(p) => (
                <span className="flex items-center gap-3">
                  {p.imagen_url && <img src={p.imagen_url} alt="" className="size-10 rounded-lg object-cover" />}
                  <span><b className="text-sm">{p.nombre}</b> <span className="text-xs text-base-500">· {soles(p.precio)} · stock {p.stock}</span></span>
                </span>
              )} />
          )}
          {tab === 'finanzas' && <Finanzas datos={datos} recargar={recargar} />}
          {tab === 'estadisticas' && <Estadisticas datos={datos} />}
          {tab === 'mijornada' && (datos.barberos.some((b) => b.usuario_id === userId)
            ? <BarberApp />
            : <ActivarPerfil onListo={recargar} />)}
          {tab === 'local' && <Local barberia={barberia} recargar={recargar} />}
          {tab === 'festivos' && <Festivos datos={datos} recargar={recargar} />}
        </div>
      </div>
      <Hoja abierta={ayuda} onClose={() => setAyuda(false)} titulo={`Ayuda: ${AYUDA[tab]?.titulo ?? 'sección'}`} ancho="sm:max-w-2xl">
        {AYUDA[tab] && (
          <div className="grid gap-5 text-sm">
            <p className="text-[var(--texto-suave)]">{AYUDA[tab].resumen}</p>
            {AYUDA[tab].secciones.map((sec) => (
              <section key={sec.titulo} className="grid gap-2">
                <h3 className="titulo text-base">{sec.titulo}</h3>
                <ul className="grid list-disc gap-1.5 pl-5">
                  {sec.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Hoja>
    </div>
  );
}

function ActivarPerfil({ onListo }: { onListo: () => void }) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  async function activar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.rpc('activar_perfil_barbero_dueno', { p_nombre: nombre });
    if (error) setError(msg(error)); else onListo();
  }
  return (
    <form onSubmit={activar} className="panel grid max-w-xl gap-3">
      <h3 className="titulo">Atiende tú también</h3>
      <p className="text-sm text-[var(--texto-suave)]">
        Activa tu perfil de barbero para marcar tu llegada, atender la cola y registrar tus cortes. Sigues teniendo todas las herramientas de administrador.
      </p>
      <label><span className="etiqueta">Tu nombre (como lo ven los clientes)</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={60} className="campo" /></label>
      {error && <Aviso>{error}</Aviso>}
      <button className="btn-acento w-fit">Activar mi perfil de barbero</button>
    </form>
  );
}

function Lealtad({ datos, recargar }: { datos: NonNullable<ReturnType<typeof useBarberia>['datos']>; recargar: () => void }) {
  const { barberia, barberos } = datos;
  async function modo(m: 'GLOBAL' | 'POR_BARBERO') {
    await supabase.from('barberias').update({ modo_gamificacion: m }).eq('id', barberia.id);
    recargar();
  }
  return (
    <div className="grid gap-5">
      <section className="neu rounded-2xl p-4 grid gap-3">
        <h3 className="titulo">Ámbito del conteo de cortes</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {([['GLOBAL', '🌐 Global', 'Suma cortes con cualquier barbero del local.'], ['POR_BARBERO', '💈 Por barbero', 'Cada barbero lleva su propia tarjeta con el cliente.']] as const).map(([v, t, d]) => (
            <button key={v} onClick={() => modo(v)} aria-pressed={barberia.modo_gamificacion === v}
              className="neu-sm neu-press rounded-xl p-3 text-left aria-pressed:neu-inset aria-pressed:ring-2 aria-pressed:ring-acento-500/60">
              <b className="text-sm block">{t}</b><span className="text-xs text-base-500">{d}</span>
            </button>
          ))}
        </div>
      </section>
      <Crud<Premio> tabla="gamificacion_premios" barberiaId={barberia.id} titulo="Metas y premios" orden="meta_cortes"
        nuevo={{ meta_cortes: 10, tipo_premio: 'GRATIS', valor_descuento: 100 } as Partial<Premio>}
        campos={[
          { k: 'meta_cortes', t: 'Cada N cortes…', tipo: 'number', req: true, min: 1, max: 100 },
          { k: 'tipo_premio', t: '…gana', tipo: 'select', opciones: [{ v: 'GRATIS', t: '1 corte GRATIS' }, { v: 'DESCUENTO', t: 'Descuento %' }] },
          { k: 'valor_descuento', t: 'Descuento % (10 a 50; ignorado si es gratis)', tipo: 'number', min: 0, max: 100 },
          { k: 'barbero_id', t: 'Aplica a', tipo: 'select', opciones: [{ v: '', t: 'Toda la barbería' }, ...barberos.map((b) => ({ v: b.id, t: `Sólo ${b.nombre}` }))] },
          { k: 'descripcion', t: 'Texto para el cliente (opcional)' }, { k: 'activo', t: 'Activo', tipo: 'bool' },
        ]}
        columnas={(p) => (
          <span className="text-sm">
            <b>Cada {p.meta_cortes} cortes</b> → {p.tipo_premio === 'GRATIS' ? 'corte GRATIS' : `${p.valor_descuento}% dscto`}
            <span className="text-xs text-base-500"> · {p.barbero_id ? barberos.find((b) => b.id === p.barbero_id)?.nombre : 'toda la barbería'}{!p.activo && ' · inactivo'}</span>
          </span>
        )} />
    </div>
  );
}
