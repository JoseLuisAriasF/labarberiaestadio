import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Plus, RotateCw, Save, Trash2 } from 'lucide-react';
import { msg, supabase } from '@/lib/supabase';
import type { DatosBarberia } from '@/lib/useBarberia';
import type { Silla } from '@/lib/tipos';
import { Aviso, Cargando } from '../ui';

const Barberia3D = lazy(() => import('../three/Barberia3D'));
// Misma rejilla que la escena 3D (COLS × FILAS). Se duplica el número para no
// cargar Three.js sólo por dos constantes.
const COLS = 10, FILAS = 6;

/** Constructor de pisos: rejilla drag-and-drop (X, Z) + vista 3D en vivo. */
export default function Pisos({ datos, recargar }: { datos: DatosBarberia; recargar: () => void }) {
  const { barberia, pisos, barberos } = datos;
  const [pisoId, setPisoId] = useState(pisos[0]?.id ?? '');
  const [sillas, setSillas] = useState<Silla[]>(datos.sillas);
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const rejilla = useRef<HTMLDivElement>(null);

  useEffect(() => setSillas(datos.sillas), [datos.sillas]);
  useEffect(() => { if (!pisos.some((p) => p.id === pisoId)) setPisoId(pisos[0]?.id ?? ''); }, [pisos]);

  const delPiso = sillas.filter((s) => s.piso_id === pisoId);
  const silla = sillas.find((s) => s.id === sel);
  const cambiar = (id: string, c: Partial<Silla>) => setSillas((xs) => xs.map((s) => (s.id === id ? { ...s, ...c } : s)));
  const ocupada = (x: number, z: number, salvo?: string) => delPiso.some((s) => s.id !== salvo && +s.posicion_x === x && +s.posicion_z === z);

  function celdaDe(e: React.PointerEvent) {
    const r = rejilla.current!.getBoundingClientRect();
    return {
      x: Math.min(COLS - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * COLS))),
      z: Math.min(FILAS - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * FILAS))),
    };
  }

  async function agregarPiso() {
    const n = Math.max(0, ...pisos.map((p) => p.numero_piso)) + 1;
    const { error } = await supabase.from('pisos').insert({ barberia_id: barberia.id, numero_piso: n, nombre: `Piso ${n}` });
    if (error) setError(msg(error)); else recargar();
  }
  async function borrarPiso() {
    if (!confirm('¿Eliminar este piso y sus sillas?')) return;
    const { error } = await supabase.from('pisos').delete().eq('id', pisoId);
    if (error) setError(msg(error)); else recargar();
  }
  async function renombrar(nombre: string) {
    await supabase.from('pisos').update({ nombre }).eq('id', pisoId);
  }
  function agregarSilla() {
    for (let z = 0; z < FILAS; z++) for (let x = 0; x < COLS; x++) if (!ocupada(x, z)) {
      const nueva = { id: `nueva-${crypto.randomUUID()}`, barberia_id: barberia.id, piso_id: pisoId, posicion_x: x, posicion_z: z, rotacion: 0, barbero_id: null };
      setSillas((xs) => [...xs, nueva]); setSel(nueva.id); return;
    }
    setError('El piso está lleno');
  }
  function quitarSilla(id: string) { setSillas((xs) => xs.filter((s) => s.id !== id)); setSel(null); }
  function asignar(id: string, barbero_id: string | null) {
    // Un barbero = una silla: si ya tenía otra, se libera.
    setSillas((xs) => xs.map((s) => (s.id === id ? { ...s, barbero_id } : s.barbero_id && s.barbero_id === barbero_id ? { ...s, barbero_id: null } : s)));
  }

  async function guardar() {
    setError(''); setOk('');
    const actuales = new Set(sillas.map((s) => s.id));
    const borradas = datos.sillas.filter((s) => !actuales.has(s.id)).map((s) => s.id);
    const fila = (s: Silla) => ({ barberia_id: barberia.id, piso_id: s.piso_id, posicion_x: s.posicion_x, posicion_z: s.posicion_z, rotacion: s.rotacion, barbero_id: s.barbero_id });
    try {
      if (borradas.length) { const { error } = await supabase.from('sillas').delete().in('id', borradas); if (error) throw error; }
      // Primero se sueltan los barberos (barbero_id es UNIQUE) y luego se asignan.
      const existentes = sillas.filter((s) => !s.id.startsWith('nueva-'));
      if (existentes.length) {
        const { error } = await supabase.from('sillas').upsert(existentes.map((s) => ({ id: s.id, ...fila(s), barbero_id: null })));
        if (error) throw error;
        const { error: e2 } = await supabase.from('sillas').upsert(existentes.map((s) => ({ id: s.id, ...fila(s) })));
        if (e2) throw e2;
      }
      const nuevas = sillas.filter((s) => s.id.startsWith('nueva-'));
      if (nuevas.length) { const { error } = await supabase.from('sillas').insert(nuevas.map(fila)); if (error) throw error; }
      setOk('Plano guardado ✅. Los clientes ya lo ven en 3D.');
      recargar();
    } catch (e) { setError(msg(e)); }
  }

  if (!pisos.length) return <button className="btn-acento" onClick={agregarPiso}><Plus className="size-4" /> Crear piso 1</button>;

  return (
    <div data-ayuda="pisos-plano" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="neu-inset rounded-xl p-1 flex gap-1 overflow-x-auto max-w-full">
          {pisos.map((p) => (
            <button key={p.id} onClick={() => { setPisoId(p.id); setSel(null); }} aria-pressed={p.id === pisoId}
              className="px-3 py-1.5 rounded-lg text-sm whitespace-nowrap aria-pressed:neu-sm aria-pressed:text-acento-500">{p.nombre || `Piso ${p.numero_piso}`}</button>
          ))}
        </div>
        <button className="btn !py-2 text-xs" onClick={agregarPiso}><Plus className="size-3" /> Piso</button>
        {pisos.length > 1 && <button className="btn !py-2 text-xs text-red-500" onClick={borrarPiso}><Trash2 className="size-3" /> Piso</button>}
        <input key={pisoId} className="campo !w-40 !py-1.5" defaultValue={pisos.find((p) => p.id === pisoId)?.nombre ?? ''} onBlur={(e) => renombrar(e.target.value)} aria-label="Nombre del piso" />
        <button className="btn ml-auto" onClick={agregarSilla}><Plus className="size-4" /> Silla</button>
        <button className="btn-acento" onClick={guardar}><Save className="size-4" /> Guardar plano</button>
      </div>
      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="grid lg:grid-cols-[1fr_18rem] gap-4">
        <div ref={rejilla} className="relative neu-inset rounded-2xl touch-none select-none" style={{ aspectRatio: `${COLS} / ${FILAS}` }}
          onPointerMove={(e) => {
            if (!arrastrando) return;
            const { x, z } = celdaDe(e);
            if (!ocupada(x, z, arrastrando)) cambiar(arrastrando, { posicion_x: x, posicion_z: z });
          }}
          onPointerUp={() => setArrastrando(null)} onPointerLeave={() => setArrastrando(null)}>
          {/* Cuadrícula de fondo */}
          <div className="absolute inset-0 grid opacity-40 pointer-events-none" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {Array.from({ length: COLS * FILAS }, (_, i) => <span key={i} className="border border-base-400/20" />)}
          </div>
          <span className="absolute -top-5 left-0 text-[10px] text-base-400">↑ fondo del local (espejos)</span>
          {delPiso.map((s) => {
            const b = barberos.find((x) => x.id === s.barbero_id);
            return (
              <button key={s.id} onPointerDown={(e) => { e.currentTarget.releasePointerCapture?.(e.pointerId); setArrastrando(s.id); setSel(s.id); }}
                className={`absolute grid place-items-center rounded-xl text-[10px] font-medium cursor-grab active:cursor-grabbing transition-[left,top] duration-75 ${s.id === sel ? 'bg-acento-500 text-white ring-2 ring-acento-300' : 'neu-sm'}`}
                style={{ left: `${(s.posicion_x / COLS) * 100}%`, top: `${(s.posicion_z / FILAS) * 100}%`, width: `${100 / COLS}%`, height: `${100 / FILAS}%` }}
                aria-label={`Silla ${b ? `de ${b.nombre}` : 'sin barbero'}`}>
                <span className="text-lg leading-none" style={{ transform: `rotate(${s.rotacion}deg)` }}>💺</span>
                <span className="truncate max-w-full px-0.5">{b?.nombre.split(' ')[0] ?? '—'}</span>
              </button>
            );
          })}
        </div>

        <aside className="neu rounded-2xl p-4 grid gap-3 content-start">
          {silla ? (
            <>
              <p className="titulo text-sm">Silla seleccionada</p>
              <label><span className="etiqueta">Barbero asignado</span>
                <select className="campo" value={silla.barbero_id ?? ''} onChange={(e) => asignar(silla.id, e.target.value || null)}>
                  <option value="">— Sin barbero —</option>
                  {barberos.filter((b) => b.activo).map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                </select></label>
              <p className="text-xs text-base-500">Posición: X {silla.posicion_x} · Z {silla.posicion_z}. Arrástrala en la rejilla.</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn text-xs" onClick={() => cambiar(silla.id, { rotacion: (Number(silla.rotacion) + 90) % 360 })}><RotateCw className="size-3" /> Girar</button>
                <button className="btn text-xs text-red-500" onClick={() => quitarSilla(silla.id)}><Trash2 className="size-3" /> Quitar</button>
              </div>
            </>
          ) : <p className="text-sm text-base-500">Toca una silla para asignarle un barbero, o agrega una nueva. Arrastra para moverla.</p>}
        </aside>
      </div>

      <Suspense fallback={<Cargando texto="Cargando vista 3D…" />}>
        <Barberia3D sillas={delPiso} barberos={barberos} seleccionId={silla?.barbero_id} alto="h-[45vh] min-h-[300px]" />
      </Suspense>
    </div>
  );
}
