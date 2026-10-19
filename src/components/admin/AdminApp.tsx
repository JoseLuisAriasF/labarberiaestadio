import { useEffect, useState } from 'react';
import { CalendarDays, Gift, LayoutGrid, MapPin, Package, Scissors, ShieldCheck, Users, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useBarberia } from '@/lib/useBarberia';
import type { Premio, Producto, Servicio } from '@/lib/tipos';
import { soles } from '@/lib/tipos';
import Agenda from '../Agenda';
import VerificarDni from '../VerificarDni';
import { Aviso, Cargando } from '../ui';
import Crud from './Crud';
import Equipo from './Equipo';
import Finanzas from './Finanzas';
import Local from './Local';
import Pisos from './Pisos';

const TABS = [
  { id: 'agenda', t: 'Citas', I: CalendarDays },
  { id: 'equipo', t: 'Barberos', I: Users },
  { id: 'servicios', t: 'Servicios', I: Scissors },
  { id: 'pisos', t: 'Pisos 3D', I: LayoutGrid },
  { id: 'clientes', t: 'Clientes', I: ShieldCheck },
  { id: 'lealtad', t: 'Lealtad', I: Gift },
  { id: 'productos', t: 'Productos', I: Package },
  { id: 'finanzas', t: 'Finanzas', I: Wallet },
  { id: 'local', t: 'Local', I: MapPin },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function AdminApp() {
  const [barberiaId, setBarberiaId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'agenda');

  // Guardia: sólo el dueño entra. (RLS lo impone igual; esto es para la UX.)
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return location.replace('/login');
      const { data } = await supabase.from('barberias').select('id').eq('owner_id', user.id).maybeSingle();
      if (!data) return location.replace('/login');
      setBarberiaId(data.id);
    });
  }, []);
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);

  const { datos, recargar } = useBarberia({ id: barberiaId ?? undefined });
  if (!barberiaId || !datos) return <Cargando texto="Abriendo tu panel…" />;
  const { barberia } = datos;
  const dias = Math.ceil((Date.parse(barberia.trial_ends_at) - Date.now()) / 864e5);

  return (
    <div className="grid gap-5 lg:grid-cols-[13rem_1fr] items-start">
      <nav aria-label="Secciones del panel" className="flex lg:flex-col gap-1 overflow-x-auto lg:sticky lg:top-20 -mx-4 px-4 lg:mx-0 lg:px-0 pb-1">
        <div className="hidden lg:block neu rounded-2xl p-3 mb-2">
          <p className="titulo text-sm truncate">{barberia.nombre}</p>
          <p className="text-xs text-base-500">Código <b className="text-acento-500">{barberia.codigo}</b></p>
          <a href={`/?b=${barberia.codigo}`} target="_blank" className="text-xs text-acento-500">Ver web pública ↗</a>
        </div>
        {TABS.map(({ id, t, I }) => (
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
            className="shrink-0 rounded-xl px-3 py-2 text-sm flex items-center gap-2 neu-press aria-[current=page]:neu-inset aria-[current=page]:text-acento-500">
            <I className="size-4" /> {t}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 min-w-0">
        {barberia.plan === 'TRIAL' && (
          <Aviso tipo={dias > 7 ? 'info' : 'error'}>
            {dias > 0 ? `🎁 Periodo de prueba: te quedan ${dias} días gratis (hasta el ${new Date(barberia.trial_ends_at).toLocaleDateString('es-PE')}).`
              : '⛔ Tu prueba terminó: las reservas online están pausadas. Escríbenos para activar tu plan.'}
          </Aviso>
        )}

        {tab === 'agenda' && (
          <Agenda barberia={barberia} barberos={datos.barberos} servicios={datos.servicios}
            // Centralizado: valida el dueño. Individual: lo valida cada barbero, pero el dueño puede siempre.
            puedeValidar={() => true} />
        )}
        {tab === 'equipo' && <Equipo datos={datos} recargar={recargar} />}
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
        {tab === 'clientes' && <VerificarDni />}
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
        {tab === 'local' && <Local barberia={barberia} recargar={recargar} />}
      </div>
    </div>
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
