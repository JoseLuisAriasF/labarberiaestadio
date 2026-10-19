import { useEffect, useMemo, useState } from 'react';
import { codigoActual, supabase } from '@/lib/supabase';
import type { Producto } from '@/lib/tipos';
import { soles } from '@/lib/tipos';

/** Llega con los productos del build (SEO) y refresca stock/precios en vivo. */
export default function Productos({ inicial, whatsapp }: { inicial: Producto[]; whatsapp?: string | null }) {
  const [lista, setLista] = useState(inicial);
  const [wa, setWa] = useState(whatsapp);
  const [cat, setCat] = useState('Todos');

  useEffect(() => {
    (async () => {
      const { data: b } = await supabase.from('barberias').select('id, whatsapp').eq('codigo', codigoActual()).maybeSingle();
      if (!b) return;
      setWa(b.whatsapp);
      const { data } = await supabase.from('productos').select('*').eq('barberia_id', b.id).eq('activo', true).order('nombre');
      if (data) setLista(data);
    })();
  }, []);

  const cats = useMemo(() => ['Todos', ...new Set(lista.map((p) => p.categoria || 'Otros'))], [lista]);
  const vis = lista.filter((p) => cat === 'Todos' || (p.categoria || 'Otros') === cat);

  return (
    <div className="grid gap-4">
      {cats.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className="btn !py-1.5 shrink-0 aria-pressed:neu-inset aria-pressed:text-acento-500">{c}</button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {vis.map((p) => (
          <li key={p.id} className="neu rounded-2xl overflow-hidden flex flex-col">
            <div className="aspect-square bg-base-200 dark:bg-base-800 grid place-items-center">
              {p.imagen_url ? <img src={p.imagen_url} alt={p.nombre} className="size-full object-cover" loading="lazy" /> : <span className="text-4xl">🧴</span>}
            </div>
            <div className="p-3 flex-1 flex flex-col gap-1">
              <h2 className="text-sm font-medium leading-tight">{p.nombre}</h2>
              {p.descripcion && <p className="text-xs text-base-500 line-clamp-2">{p.descripcion}</p>}
              <div className="mt-auto pt-2 flex items-center justify-between">
                <b>{soles(p.precio)}</b>
                <span className={`text-[11px] ${p.stock > 0 ? 'text-green-500' : 'text-red-400'}`}>{p.stock > 0 ? `${p.stock} disponibles` : 'Agotado'}</span>
              </div>
              {wa && p.stock > 0 && (
                <a className="btn !py-1.5 mt-2 text-xs" target="_blank" rel="noopener"
                  href={`https://wa.me/${wa.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, quiero separar: ${p.nombre} (${soles(p.precio)})`)}`}>
                  Separar por WhatsApp
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {vis.length === 0 && <p className="text-sm text-base-400 text-center py-10">Pronto publicaremos nuestros productos.</p>}
    </div>
  );
}
