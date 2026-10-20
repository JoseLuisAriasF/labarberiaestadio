import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { hoyLima, sumarDias } from '@/lib/agenda';
import { ESTADOS_CITA } from '@/lib/tipos';
import { Hoja } from '../ui';

interface CitaDia {
  id: string; fecha_hora: string; estado: string; tipo: string; nombre_walkin: string | null; precio: number;
  servicios_cortes: { nombre: string } | null; clientes: { nombre: string | null; telefono: string | null } | null;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
const diaLima = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
const nombreDe = (c: CitaDia) => c.clientes?.nombre || c.nombre_walkin || 'Sin nombre';

/** Inicio del barbero: sus citas de hoy y de mañana. Toca una para ver el detalle. */
export default function HoyYManana({ barberoId, cola, onVerCitas }: { barberoId: string; cola: number; onVerCitas: () => void }) {
  const [citas, setCitas] = useState<CitaDia[] | null>(null);
  const [detalle, setDetalle] = useState<CitaDia | null>(null);
  const hoy = hoyLima();
  const manana = sumarDias(hoy, 1);

  useEffect(() => {
    const desde = new Date(`${hoy}T00:00:00-05:00`).toISOString();
    const hasta = new Date(`${sumarDias(hoy, 2)}T00:00:00-05:00`).toISOString();
    supabase.from('citas').select('id, fecha_hora, estado, tipo, nombre_walkin, precio, servicios_cortes(nombre), clientes(nombre, telefono)')
      .eq('barbero_id', barberoId).gte('fecha_hora', desde).lt('fecha_hora', hasta)
      .not('estado', 'in', '(CANCELADA,RECHAZADA,NO_ASISTIO)').order('fecha_hora')
      .then(({ data }) => setCitas((data ?? []) as unknown as CitaDia[]));
  }, [barberoId, cola, hoy]);

  const lista = (dia: string) => (citas ?? []).filter((c) => diaLima(c.fecha_hora) === dia);

  function Bloque({ titulo, dia, vacio }: { titulo: string; dia: string; vacio: string }) {
    const items = lista(dia);
    return (
      <section className="panel grid gap-2">
        <p className="text-sm font-semibold">{titulo} <span className="text-[var(--texto-suave)]">({items.length})</span></p>
        {citas === null ? <p className="text-sm text-[var(--texto-suave)]">Cargando…</p>
          : items.length === 0 ? <p className="text-sm text-[var(--texto-suave)]">{vacio}</p>
          : (
            <ul className="grid gap-1.5">
              {items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setDetalle(c)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--borde)] px-3 py-2 text-left">
                    <span className="w-12 shrink-0 tabular-nums text-sm font-bold">{hora(c.fecha_hora)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{nombreDe(c)}</span>
                      <span className="block truncate text-xs text-[var(--texto-suave)]">{c.servicios_cortes?.nombre ?? 'Corte'}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-medium ${ESTADOS_CITA[c.estado as keyof typeof ESTADOS_CITA]?.clase ?? ''}`}>
                      {ESTADOS_CITA[c.estado as keyof typeof ESTADOS_CITA]?.texto ?? c.estado}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
    );
  }

  const tel = detalle?.clientes?.telefono?.replace(/\D/g, '').slice(-9);
  return (
    <div data-ayuda="inicio-hoy" className="grid gap-3">
      <Bloque titulo="Hoy" dia={hoy} vacio="No tienes citas hoy." />
      <Bloque titulo="Mañana" dia={manana} vacio="No tienes citas mañana." />

      <Hoja abierta={!!detalle} onClose={() => setDetalle(null)} titulo={detalle ? nombreDe(detalle) : 'Cita'}>
        {detalle && (
          <div className="grid gap-3 text-sm">
            <p><b>{diaLima(detalle.fecha_hora) === hoy ? 'Hoy' : 'Mañana'}</b> a las <b>{hora(detalle.fecha_hora)}</b></p>
            <p>Corte: <b>{detalle.servicios_cortes?.nombre ?? 'Corte'}</b> · S/ {Number(detalle.precio).toFixed(2)}</p>
            <p>Estado: <b>{ESTADOS_CITA[detalle.estado as keyof typeof ESTADOS_CITA]?.texto ?? detalle.estado}</b></p>
            <p className="text-[var(--texto-suave)]">{detalle.tipo === 'WALKIN' ? 'Llegó sin cita.' : detalle.clientes ? 'Cliente con cuenta.' : 'Reserva anónima (sin DNI).'}</p>
            {tel && tel.length === 9 && (
              <a href={`https://wa.me/51${tel}`} target="_blank" rel="noopener" className="btn-whatsapp">Escribirle por WhatsApp</a>
            )}
            <button type="button" className="btn-acento" onClick={() => { setDetalle(null); onVerCitas(); }}>Gestionar en Citas</button>
          </div>
        )}
      </Hoja>
    </div>
  );
}
