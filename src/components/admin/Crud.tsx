import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { msg, subirImagen, supabase } from '@/lib/supabase';
import { Aviso, Hoja } from '../ui';

export interface Campo {
  k: string; t: string;
  tipo?: 'text' | 'number' | 'textarea' | 'bool' | 'imagen' | 'select';
  opciones?: { v: string; t: string }[];
  req?: boolean; min?: number; max?: number; paso?: number;
}

/** Tabla + formulario para un catálogo del dueño (servicios, productos, premios).
    Escribe directo en la tabla: la política RLS `dueno_escribe` es quien autoriza. */
export default function Crud<T extends { id: string }>({ tabla, barberiaId, campos, columnas, titulo, orden = 'nombre', nuevo }: {
  tabla: string; barberiaId: string; campos: Campo[]; titulo: string; orden?: string;
  columnas: (f: T) => React.ReactNode; nuevo?: Partial<T>;
}) {
  const [filas, setFilas] = useState<T[]>([]);
  const [editando, setEditando] = useState<Partial<T> | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = () => supabase.from(tabla).select('*').eq('barberia_id', barberiaId).order(orden)
    .then(({ data }) => setFilas((data ?? []) as T[]));
  useEffect(() => { cargar(); }, [barberiaId]);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardando(true); setError('');
    try {
      const f = new FormData(e.currentTarget);
      const fila: Record<string, unknown> = { barberia_id: barberiaId };
      for (const c of campos) {
        if (c.tipo === 'bool') fila[c.k] = f.get(c.k) === 'on';
        else if (c.tipo === 'imagen') {
          const a = f.get(c.k) as File;
          if (a?.size) fila[c.k] = (await subirImagen('publico', `${barberiaId}/${tabla}`, a)).url;
        } else if (c.tipo === 'number') fila[c.k] = Number(f.get(c.k));
        else fila[c.k] = (String(f.get(c.k) ?? '').trim() || null);
      }
      const q = editando?.id ? supabase.from(tabla).update(fila).eq('id', editando.id) : supabase.from(tabla).insert(fila);
      const { error } = await q;
      if (error) throw error;
      setEditando(null);
      cargar();
    } catch (e) { setError(msg(e)); } finally { setGuardando(false); }
  }

  async function borrar(id: string) {
    if (!confirm('¿Eliminar definitivamente?')) return;
    const { error } = await supabase.from(tabla).delete().eq('id', id);
    if (error) setError(msg(error)); else cargar();
  }

  const v = (k: string) => (editando as Record<string, unknown> | null)?.[k];
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="titulo text-lg">{titulo}</h2>
        <button className="btn-acento" onClick={() => setEditando({ ...(nuevo ?? {}) } as Partial<T>)}><Plus className="size-4" /> Nuevo</button>
      </div>
      {error && !editando && <Aviso>{error}</Aviso>}
      <ul className="grid gap-2">
        {filas.map((f) => (
          <li key={f.id} className="neu-sm rounded-xl px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">{columnas(f)}</div>
            <button className="btn !p-2" aria-label="Editar" onClick={() => setEditando(f)}><Pencil className="size-4" /></button>
            <button className="btn !p-2 text-red-500" aria-label="Eliminar" onClick={() => borrar(f.id)}><Trash2 className="size-4" /></button>
          </li>
        ))}
        {filas.length === 0 && <p className="text-sm text-base-400 py-4 text-center">Aún no hay registros.</p>}
      </ul>

      <Hoja abierta={!!editando} onClose={() => setEditando(null)} titulo={editando?.id ? 'Editar' : 'Nuevo'}>
        <form onSubmit={guardar} className="grid gap-3" key={String(editando?.id ?? 'nuevo')}>
          {campos.map((c) => (
            <label key={c.k} className={c.tipo === 'bool' ? 'flex items-center gap-2 text-sm' : ''}>
              {c.tipo === 'bool' ? (
                <><input type="checkbox" name={c.k} defaultChecked={(v(c.k) as boolean) ?? true} className="accent-acento-500 size-4" /> {c.t}</>
              ) : (
                <>
                  <span className="etiqueta">{c.t}</span>
                  {c.tipo === 'textarea' ? <textarea name={c.k} defaultValue={(v(c.k) as string) ?? ''} rows={3} className="campo" maxLength={600} />
                    : c.tipo === 'imagen' ? (
                      <span className="flex items-center gap-3">
                        {v(c.k) ? <img src={v(c.k) as string} alt="" className="size-14 rounded-lg object-cover" /> : null}
                        <input type="file" name={c.k} accept="image/jpeg,image/png,image/webp" className="text-sm" />
                      </span>)
                    : c.tipo === 'select' ? (
                      <select name={c.k} defaultValue={(v(c.k) as string) ?? c.opciones?.[0]?.v} className="campo">
                        {c.opciones!.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
                      </select>)
                    : <input name={c.k} type={c.tipo ?? 'text'} required={c.req} min={c.min} max={c.max} step={c.paso}
                        defaultValue={(v(c.k) as string | number) ?? ''} className="campo" />}
                </>
              )}
            </label>
          ))}
          {error && <Aviso>{error}</Aviso>}
          <button disabled={guardando} className="btn-acento">{guardando ? 'Guardando…' : 'Guardar'}</button>
        </form>
      </Hoja>
    </section>
  );
}
