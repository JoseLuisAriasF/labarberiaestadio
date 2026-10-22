import { useEffect, useMemo, useState } from 'react';
import { msg, supabase } from '@/lib/supabase';
import { hoyLima } from '@/lib/agenda';
import type { DatosBarberia } from '@/lib/useBarberia';
import { soles } from '@/lib/tipos';
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
      {filas.length === 0 ? <p className="text-sm text-[var(--texto-suave)]">Sin datos este mes.</p> : (
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

export default function Estadisticas({ datos, miBarberoId = null }: { datos: DatosBarberia; miBarberoId?: string | null }) {
  const { barberia, barberos } = datos;
  // El barbero solo ve sus propias citas del mes, sin gráficas por día ni por hora.
  const soloMio = !!miBarberoId;
  const [mes, setMes] = useState(hoyLima().slice(0, 7));
  const [citas, setCitas] = useState<Cita[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const desde = new Date(`${mes}-01T00:00:00-05:00`);
    const hasta = new Date(desde); hasta.setMonth(hasta.getMonth() + 1);
    supabase.from('citas').select('fecha_hora, precio, barbero_id, nombre_walkin, servicios_cortes(nombre), clientes(nombre, dni)')
      .eq('barberia_id', barberia.id).eq('estado', 'COMPLETADA')
      .gte('fecha_hora', desde.toISOString()).lt('fecha_hora', hasta.toISOString())
      .then(({ data, error }) => {
        if (error) setError(msg(error)); else { setError(''); const todas = (data ?? []) as unknown as Cita[]; setCitas(soloMio ? todas.filter((c) => c.barbero_id === miBarberoId) : todas); }
      });
  }, [mes, barberia.id, soloMio, miBarberoId]);

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
      <div className="flex items-center gap-2">
        <h3 className="titulo">Estadísticas del mes</h3>
        <input type="month" className="campo !w-auto ml-auto" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
      </div>
      {error && <Aviso>{error}</Aviso>}
      <div data-ayuda="est-resumen" className="grid grid-cols-3 gap-2 text-center">
        <div className="panel"><p className="text-lg font-bold">{soles(ingresos)}</p><p className="text-xs text-[var(--texto-suave)]">facturado</p></div>
        <div className="panel"><p className="text-lg font-bold">{citas.length}</p><p className="text-xs text-[var(--texto-suave)]">cortes</p></div>
        <div className="panel"><p className="text-lg font-bold">{soles(citas.length ? ingresos / citas.length : 0)}</p><p className="text-xs text-[var(--texto-suave)]">ticket promedio</p></div>
      </div>
      <div data-ayuda="est-graficos" className="grid gap-4 sm:grid-cols-2">
        {!soloMio && <Barras titulo="Ingresos por día (S/)" filas={porDia} fmt={(v) => soles(v).replace('S/ ', '')} />}
        <Barras titulo="Servicios más pedidos" filas={servicios} />
        {!soloMio && <Barras titulo="Horas con más cortes" filas={horas} />}
        {!soloMio && <Barras titulo="Cortes por barbero" filas={porBarbero} />}
        {!soloMio && <Barras titulo="Clientes más frecuentes" filas={frecuentes} />}
      </div>
    </div>
  );
}
