import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Barberia, Barbero, BarberoServicio, Piso, Servicio, Silla } from './tipos';

export interface DatosBarberia {
  barberia: Barberia; pisos: Piso[]; sillas: Silla[]; barberos: Barbero[];
  servicios: Servicio[]; barberoServicios: BarberoServicio[];
}

/** Carga una barbería por código o id y mantiene vivos los estados de sus
    barberos vía Supabase Realtime (postgres_changes sobre `barberos`). */
export function useBarberia(clave: { codigo?: string; id?: string }) {
  const [datos, setDatos] = useState<DatosBarberia | null>(null);
  const [error, setError] = useState('');
  const [enVivo, setEnVivo] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let vivo = true;
    if (!clave.codigo && !clave.id) return;
    (async () => {
      const q = supabase.from('barberias').select('*');
      const { data: barberia, error: e } = await (clave.id ? q.eq('id', clave.id) : q.eq('codigo', clave.codigo!)).maybeSingle();
      if (!vivo) return;
      if (e || !barberia) { setError(e?.message || 'No encontramos esta barbería.'); return; }
      const id = barberia.id;
      const [pisos, sillas, barberos, servicios, bs] = await Promise.all([
        supabase.from('pisos').select('*').eq('barberia_id', id).order('numero_piso'),
        supabase.from('sillas').select('*').eq('barberia_id', id),
        supabase.from('barberos').select('*').eq('barberia_id', id).order('nombre'),
        supabase.from('servicios_cortes').select('*').eq('barberia_id', id).eq('activo', true).order('precio_base'),
        supabase.from('barbero_servicios').select('barbero_id, servicio_id, es_bestseller, barberos!inner(barberia_id)').eq('barberos.barberia_id', id),
      ]);
      if (!vivo) return;
      setDatos({
        barberia, pisos: pisos.data ?? [], sillas: sillas.data ?? [], barberos: barberos.data ?? [],
        servicios: servicios.data ?? [], barberoServicios: (bs.data ?? []) as unknown as BarberoServicio[],
      });

      canal = supabase
        .channel(`barberos:${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'barberos', filter: `barberia_id=eq.${id}` }, (p) => {
          setDatos((d) => {
            if (!d) return d;
            if (p.eventType === 'DELETE') return { ...d, barberos: d.barberos.filter((b) => b.id !== (p.old as Barbero).id) };
            const nuevo = p.new as Barbero;
            const existe = d.barberos.some((b) => b.id === nuevo.id);
            return { ...d, barberos: existe ? d.barberos.map((b) => (b.id === nuevo.id ? nuevo : b)) : [...d.barberos, nuevo] };
          });
        })
        .subscribe((s) => setEnVivo(s === 'SUBSCRIBED'));
    })();

    // Al volver a la pestaña (móvil dormido), el socket pudo perder eventos.
    const alVolver = () => document.visibilityState === 'visible' && setVersion((v) => v + 1);
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; canal && supabase.removeChannel(canal); document.removeEventListener('visibilitychange', alVolver); };
  }, [clave.codigo, clave.id, version]);

  return { datos, setDatos, error, enVivo, recargar: () => setVersion((v) => v + 1) };
}
