import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { msg, supabase } from '@/lib/supabase';
import { hoyLima } from '@/lib/agenda';
import { desplazar, diasTranscurridos, etiquetaPeriodo, rangoDe, type Periodo, type Rango } from '@/lib/periodo';
import type { DatosBarberia } from '@/lib/useBarberia';
import { soles } from '@/lib/tipos';
import type { Barbero } from '@/lib/tipos';
import { Aviso } from '../ui';

interface Cita {
  fecha_hora: string; precio: number; barbero_id: string; nombre_walkin: string | null;
  servicios_cortes: { nombre: string } | null; clientes: { nombre: string | null; dni: string | null } | null;
}

const dia = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
const hora = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }));

function contar<T>(items: T[], clave: (t: T) => string) {
  const m = new Map<string, number>();
  for (const it of items) { const k = clave(it); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

function Barras({ titulo, filas, fmt }: { titulo: string; filas: { k: string; v: number }[]; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...filas.map((f) => f.v));
  return (
    <div className="panel grid gap-3 content-start">
      <h4 className="text-sm font-semibold">{titulo}</h4>
      {filas.length === 0 ? <p className="text-sm text-[var(--texto-suave)]">Sin datos en este periodo.</p> : (
        <ul className="grid gap-2">
          {filas.map((f) => (
            <li key={f.k} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
              <span className="truncate">{f.k}</span>
              <span className="h-3 overflow-hidden rounded bg-acento-500/15">
                <span className="block h-full bg-acento-500" style={{ width: `${(f.v / max) * 100}%` }} />
              </span>
              <b className="text-xs tabular-nums">{fmt ? fmt(f.v) : f.v}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface VentaP {
  venta_id: string; barbero_id: string; producto_id: string | null; nombre_producto: string;
  cantidad: number; precio_unitario: number; metodo_pago: string;
}
interface ReposP { producto_id: string | null; cantidad: number; costo_unitario: number | null }
interface StockP { id: string; nombre: string; stock: number; activo: boolean }

const PERIODOS: [Periodo, string][] = [['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']];
const METODO_TXT: Record<string, string> = { EFECTIVO: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin', TRANSFERENCIA: 'Transferencia' };

/** Qué se vende, con qué ritmo, qué margen deja y cuándo se agota cada producto: para decidir qué reponer. */
function ProductosStats({ barberiaId, rango, barberos }: { barberiaId: string; rango: Rango; barberos: Barbero[] }) {
  const [ventas, setVentas] = useState<VentaP[]>([]);
  const [repos, setRepos] = useState<ReposP[]>([]);
  const [stock, setStock] = useState<StockP[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const ini = new Date(`${rango.desde}T00:00:00-05:00`).toISOString(), fin = new Date(`${rango.hasta}T00:00:00-05:00`).toISOString();
    Promise.all([
      supabase.from('ventas_productos').select('venta_id, barbero_id, producto_id, nombre_producto, cantidad, precio_unitario, metodo_pago')
        .eq('barberia_id', barberiaId).gte('created_at', ini).lt('created_at', fin),
      supabase.from('reposiciones_producto').select('producto_id, cantidad, costo_unitario')
        .eq('barberia_id', barberiaId).gte('created_at', ini).lt('created_at', fin).order('created_at', { ascending: false }),
      supabase.from('productos').select('id, nombre, stock, activo').eq('barberia_id', barberiaId),
    ]).then(([v, r, p]) => {
      const e = v.error ?? r.error ?? p.error;
      if (e) return setError(msg(e));
      setError('');
      setVentas((v.data ?? []) as VentaP[]);
      setRepos((r.data ?? []) as ReposP[]);
      setStock((p.data ?? []) as StockP[]);
    });
  }, [barberiaId, rango.desde, rango.hasta]);

  // El ritmo de venta usa solo los días ya vividos del periodo.
  const dias = diasTranscurridos(rango);
  const unidades = ventas.reduce((n, v) => n + v.cantidad, 0);
  const facturado = ventas.reduce((n, v) => n + v.cantidad * Number(v.precio_unitario), 0);
  const cobros = new Set(ventas.map((v) => v.venta_id)).size;
  const repuestas = repos.reduce((n, r) => n + r.cantidad, 0);
  const inversion = repos.reduce((n, r) => n + (r.costo_unitario != null ? r.cantidad * Number(r.costo_unitario) : 0), 0);

  // Costo vigente: el de la reposición más reciente (la lista llega ordenada de nueva a vieja).
  const costo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of repos) if (r.producto_id && r.costo_unitario != null && !m.has(r.producto_id)) m.set(r.producto_id, Number(r.costo_unitario));
    return m;
  }, [repos]);

  const ranking = useMemo(() => {
    const m = new Map<string, { id: string | null; nombre: string; u: number; margen: number | null }>();
    for (const v of ventas) {
      const k = v.producto_id ?? `nombre:${v.nombre_producto}`;
      const f = m.get(k) ?? { id: v.producto_id, nombre: v.nombre_producto, u: 0, margen: null };
      const c = v.producto_id ? costo.get(v.producto_id) : undefined;
      f.u += v.cantidad;
      if (c !== undefined) f.margen = (f.margen ?? 0) + v.cantidad * (Number(v.precio_unitario) - c);
      m.set(k, f);
    }
    return [...m.values()].sort((a, b) => b.u - a.u);
  }, [ventas, costo]);
  const margen = ranking.reduce((n, r) => n + (r.margen ?? 0), 0);
  const conCosto = ranking.some((r) => r.margen !== null);

  // Días de stock = stock ÷ ritmo diario. Lo que se agota antes va arriba.
  const rotacion = useMemo(() => {
    const vendidasPorId = new Map(ranking.filter((r) => r.id).map((r) => [r.id as string, r.u]));
    return stock.filter((p) => p.activo).map((p) => {
      const ritmo = (vendidasPorId.get(p.id) ?? 0) / Math.max(dias, 1);
      return { ...p, diasStock: ritmo > 0 ? p.stock / ritmo : null };
    }).sort((a, b) => (a.diasStock ?? 1e9) - (b.diasStock ?? 1e9));
  }, [stock, ranking, dias]);

  const porBarbero = barberos.map((b) => ({
    k: b.nombre, v: ventas.filter((v) => v.barbero_id === b.id).reduce((n, v) => n + v.cantidad * Number(v.precio_unitario), 0),
  })).sort((a, b) => b.v - a.v);
  const porMetodo = useMemo(() => {
    const porVenta = new Map(ventas.map((v) => [v.venta_id, v.metodo_pago]));
    return [...contar([...porVenta.values()], (x) => x)].map(([k, v]) => ({ k: METODO_TXT[k] ?? k, v })).sort((a, b) => b.v - a.v);
  }, [ventas]);

  return (
    <section className="grid gap-4">
      <h3 className="titulo">Productos</h3>
      {error && <Aviso>{error}</Aviso>}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="panel"><p className="text-lg font-bold">{unidades}</p><p className="text-xs text-[var(--texto-suave)]">unidades vendidas</p></div>
        <div className="panel"><p className="text-lg font-bold">{soles(facturado)}</p><p className="text-xs text-[var(--texto-suave)]">facturado</p></div>
        <div className="panel"><p className="text-lg font-bold">{cobros}</p><p className="text-xs text-[var(--texto-suave)]">cobros</p></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Barras titulo="Más vendidos (unidades)" filas={ranking.slice(0, 8).map((r) => ({ k: r.nombre, v: r.u }))} />
        <Barras titulo="Ventas por barbero (S/)" filas={porBarbero} fmt={(v) => soles(v).replace('S/ ', '')} />
        <Barras titulo="Cómo pagan" filas={porMetodo} />
        <div className="panel grid gap-2 content-start">
          <h4 className="text-sm font-semibold">Reposición y margen</h4>
          <p className="text-sm">Repusiste <b>{repuestas}</b> unidades por <b>{soles(inversion)}</b></p>
          {conCosto
            ? <p className="text-sm">Margen estimado: <b>{soles(margen)}</b></p>
            : <p className="text-sm text-[var(--texto-suave)]">Indica el costo al reponer para ver el margen.</p>}
          <p className="text-xs text-[var(--texto-suave)]">Margen = precio de venta − costo de la última reposición del periodo.</p>
        </div>
      </div>
      <div className="panel grid gap-2">
        <h4 className="text-sm font-semibold">Stock y cuándo se agota <span className="font-normal text-[var(--texto-suave)]">(ritmo de {dias} días)</span></h4>
        {rotacion.length === 0 ? <p className="text-sm text-[var(--texto-suave)]">Sin productos publicados.</p> : (
          <ul className="grid gap-2">
            {rotacion.map((p) => {
              const urgente = p.stock <= 0 || (p.diasStock !== null && p.diasStock < 7);
              return (
                <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                  <span className="truncate">{p.nombre} <span className="text-xs text-[var(--texto-suave)]">· stock {p.stock}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${urgente ? 'bg-red-500/15 text-red-500' : 'bg-[var(--borde)]'}`}>
                    {p.stock <= 0 ? 'Agotado' : p.diasStock === null ? 'sin ventas' : urgente ? 'Reponer ya' : `≈ ${Math.round(p.diasStock)} días`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function Estadisticas({ datos, miBarberoId = null }: { datos: DatosBarberia; miBarberoId?: string | null }) {
  const { barberia, barberos } = datos;
  // El barbero solo ve sus propias citas del periodo, sin gráficas por día ni por hora.
  const soloMio = !!miBarberoId;
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  // Fecha de referencia: cualquier día dentro del periodo elegido.
  const [fecha, setFecha] = useState(hoyLima());
  const rango = useMemo(() => rangoDe(periodo, fecha), [periodo, fecha]);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('citas').select('fecha_hora, precio, barbero_id, nombre_walkin, servicios_cortes(nombre), clientes(nombre, dni)')
      .eq('barberia_id', barberia.id).eq('estado', 'COMPLETADA')
      .gte('fecha_hora', new Date(`${rango.desde}T00:00:00-05:00`).toISOString())
      .lt('fecha_hora', new Date(`${rango.hasta}T00:00:00-05:00`).toISOString())
      .then(({ data, error }) => {
        if (error) setError(msg(error)); else { setError(''); const todas = (data ?? []) as unknown as Cita[]; setCitas(soloMio ? todas.filter((c) => c.barbero_id === miBarberoId) : todas); }
      });
  }, [rango.desde, rango.hasta, barberia.id, soloMio, miBarberoId]);

  const ingresos = useMemo(() => citas.reduce((n, c) => n + Number(c.precio), 0), [citas]);
  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of citas) m.set(dia(c.fecha_hora), (m.get(dia(c.fecha_hora)) ?? 0) + Number(c.precio));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k: k.slice(8), v }));
  }, [citas]);
  const servicios = useMemo(() => [...contar(citas, (c) => c.servicios_cortes?.nombre ?? 'Sin nombre')]
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ k, v })), [citas]);
  const horas = useMemo(() => {
    const m = contar(citas, (c) => String(hora(c.fecha_hora)).padStart(2, '0'));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k: `${k}:00`, v }));
  }, [citas]);
  const porBarbero = useMemo(() => {
    const m = contar(citas, (c) => c.barbero_id);
    return barberos.map((b) => ({ k: b.nombre, v: m.get(b.id) ?? 0 })).sort((a, b) => b.v - a.v);
  }, [citas, barberos]);
  const frecuentes = useMemo(() => {
    const m = new Map<string, { nombre: string; n: number }>();
    // Solo clientes con documento: los cortes anónimos no son una misma persona, no se agrupan.
    for (const c of citas) {
      if (!c.clientes?.dni) continue;
      const nombre = c.clientes.nombre || c.clientes.dni;
      m.set(c.clientes.dni, { nombre, n: (m.get(c.clientes.dni)?.n ?? 0) + 1 });
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((c) => ({ k: c.nombre, v: c.n }));
  }, [citas]);

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <h3 className="titulo">Estadísticas</h3>
        <div role="radiogroup" aria-label="Periodo" className="neu-inset grid grid-cols-3 gap-1 rounded-2xl p-1">
          {PERIODOS.map(([v, t]) => (
            <button key={v} type="button" role="radio" aria-checked={periodo === v} onClick={() => setPeriodo(v)}
              className="min-h-11 rounded-xl text-sm font-semibold text-[var(--texto-suave)] transition-colors aria-checked:bg-acento-500 aria-checked:text-black">
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Periodo anterior" onClick={() => setFecha(desplazar(periodo, fecha, -1))} className="btn !p-2"><ChevronLeft className="size-5" /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold capitalize">{etiquetaPeriodo(periodo, fecha)}</p>
            {rangoDe(periodo, hoyLima()).desde !== rango.desde && (
              <button type="button" onClick={() => setFecha(hoyLima())} className="text-xs font-semibold text-acento-400 underline">Ir a hoy</button>
            )}
          </div>
          <button type="button" aria-label="Periodo siguiente" onClick={() => setFecha(desplazar(periodo, fecha, 1))} className="btn !p-2"><ChevronRight className="size-5" /></button>
          <input type={periodo === 'mes' ? 'month' : 'date'} aria-label="Elegir fecha" className="campo !w-auto !py-1.5 text-xs"
            value={periodo === 'mes' ? fecha.slice(0, 7) : fecha}
            onChange={(e) => e.target.value && setFecha(periodo === 'mes' ? `${e.target.value}-01` : e.target.value)} />
        </div>
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div data-ayuda="est-resumen" className="grid grid-cols-3 gap-2 text-center">
        <div className="panel"><p className="text-lg font-bold">{soles(ingresos)}</p><p className="text-xs text-[var(--texto-suave)]">facturado</p></div>
        <div className="panel"><p className="text-lg font-bold">{citas.length}</p><p className="text-xs text-[var(--texto-suave)]">cortes</p></div>
        <div className="panel"><p className="text-lg font-bold">{soles(citas.length ? ingresos / citas.length : 0)}</p><p className="text-xs text-[var(--texto-suave)]">ticket promedio</p></div>
      </div>
      <div data-ayuda="est-graficos" className="grid gap-4 sm:grid-cols-2">
        {!soloMio && periodo !== 'dia' && <Barras titulo="Ingresos por día (S/)" filas={porDia} fmt={(v) => soles(v).replace('S/ ', '')} />}
        <Barras titulo="Servicios más pedidos" filas={servicios} />
        {!soloMio && <Barras titulo="Horas con más cortes" filas={horas} />}
        {!soloMio && <Barras titulo="Cortes por barbero" filas={porBarbero} />}
        {!soloMio && <Barras titulo="Clientes más frecuentes" filas={frecuentes} />}
      </div>
      {!soloMio && <ProductosStats barberiaId={barberia.id} rango={rango} barberos={barberos} />}
    </div>
  );
}
