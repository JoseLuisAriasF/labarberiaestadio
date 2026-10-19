import { useEffect, useMemo, useState } from 'react';
import { msg, supabase } from '@/lib/supabase';
import { Aviso, Hoja } from './ui';
import VerificarDni from './VerificarDni';

export interface Tarjeta { barbero_id: string | null; barbero_nombre: string | null; cortes: number; meta: number; faltan: number; premio: string }
interface Resumen { cliente_id: string; nombre: string | null; documento: string; documento_tipo: string; cortes: number; ultima_visita: string }
interface Historial { id: string; fecha_hora: string; estado: string; servicios_cortes: { nombre: string } | null; barberos: { nombre: string } | null }

const fecha = (iso: string, extra: Intl.DateTimeFormatOptions = {}) =>
  new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', ...extra });

export function Tarjetas({ tarjetas }: { tarjetas: Tarjeta[] }) {
  if (tarjetas.length === 0) return <p className="text-sm text-[var(--texto-suave)]">Todavía no tiene cortes sumados en esta barbería.</p>;
  return (
    <div className="grid gap-3">
      {tarjetas.map((t) => {
        const pct = Math.min(100, Math.round((t.cortes / t.meta) * 100));
        const sinPremio = t.premio === 'Sin premio activo';
        return (
          <div key={t.barbero_id ?? 'general'} className="panel grid gap-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">{t.barbero_nombre ? `Con ${t.barbero_nombre}` : 'Cartilla general'}</span>
              <span className="chip">{t.cortes}/{t.meta}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--superficie)]">
              <div className="h-full bg-acento-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm">
              {sinPremio ? 'No hay premio activo para esta cartilla.'
                : t.faltan === 0 ? `¡Listo! Ya puede canjear ${t.premio}.`
                : t.faltan <= 2 ? `¡Le falta poco! ${t.faltan} ${t.faltan === 1 ? 'corte' : 'cortes'} para ${t.premio}.`
                : `Le faltan ${t.faltan} cortes para ${t.premio}.`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function ClientesPanel({ barberiaId }: { barberiaId: string }) {
  const [lista, setLista] = useState<Resumen[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<Resumen | null>(null);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [historial, setHistorial] = useState<Historial[]>([]);

  useEffect(() => {
    supabase.rpc('resumen_clientes', { p_barberia: barberiaId }).then(({ data, error }) => {
      if (error) setError(msg(error)); else setLista((data ?? []) as Resumen[]);
    });
  }, [barberiaId]);

  async function abrir(c: Resumen) {
    setAbierto(c); setTarjetas([]); setHistorial([]);
    const [t, h] = await Promise.all([
      supabase.rpc('tarjetas_cliente', { p_cliente: c.cliente_id, p_barberia: barberiaId }),
      supabase.from('citas').select('id, fecha_hora, estado, servicios_cortes(nombre), barberos(nombre)')
        .eq('cliente_id', c.cliente_id).eq('barberia_id', barberiaId).order('fecha_hora', { ascending: false }).limit(20),
    ]);
    setTarjetas((t.data ?? []) as Tarjeta[]);
    setHistorial((h.data ?? []) as unknown as Historial[]);
  }

  const filtrada = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? lista.filter((c) => (c.nombre ?? '').toLowerCase().includes(s) || c.documento.includes(s)) : lista;
  }, [q, lista]);

  return (
    <div className="grid gap-5">
      <VerificarDni />
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="titulo">Clientes ({lista.length})</h3>
          <input className="campo ml-auto !w-64" placeholder="Buscar por nombre o documento" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error && <Aviso>{error}</Aviso>}
        <ul className="grid gap-2">
          {filtrada.map((c) => (
            <li key={c.cliente_id}>
              <button onClick={() => abrir(c)} className="panel flex w-full items-center gap-3 text-left hover:border-acento-500/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.nombre || 'Sin nombre'}</span>
                  <span className="block text-xs text-[var(--texto-suave)]">{c.documento_tipo} {c.documento} · última visita {fecha(c.ultima_visita)}</span>
                </span>
                <span className="chip">{c.cortes} {c.cortes === 1 ? 'corte' : 'cortes'}</span>
              </button>
            </li>
          ))}
          {filtrada.length === 0 && <li className="text-sm text-[var(--texto-suave)]">Aún no hay clientes con cortes.</li>}
        </ul>
      </section>

      <Hoja abierta={!!abierto} onClose={() => setAbierto(null)} titulo={abierto?.nombre || 'Cliente'}>
        {abierto && (
          <div className="grid gap-5">
            <p className="text-sm text-[var(--texto-suave)]">{abierto.documento_tipo} {abierto.documento} · {abierto.cortes} cortes completados</p>
            <div className="grid gap-2">
              <p className="etiqueta">Cartillas y premios</p>
              <Tarjetas tarjetas={tarjetas} />
            </div>
            <div className="grid gap-2">
              <p className="etiqueta">Últimas citas</p>
              <ul className="grid">
                {historial.map((h) => (
                  <li key={h.id} className="flex justify-between gap-2 border-b border-[var(--borde)] py-2 text-sm">
                    <span>{fecha(h.fecha_hora, { hour: '2-digit', minute: '2-digit' })} · {h.servicios_cortes?.nombre ?? 'Corte'} · {h.barberos?.nombre}</span>
                    <span className="text-xs text-[var(--texto-suave)]">{h.estado.toLowerCase()}</span>
                  </li>
                ))}
                {historial.length === 0 && <li className="text-sm text-[var(--texto-suave)]">Sin citas.</li>}
              </ul>
            </div>
          </div>
        )}
      </Hoja>
    </div>
  );
}
