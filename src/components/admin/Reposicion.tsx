import { useEffect, useState } from 'react';
import { PackagePlus } from 'lucide-react';
import { msg, supabase } from '@/lib/supabase';
import type { Producto } from '@/lib/tipos';
import { soles } from '@/lib/tipos';
import { Aviso, BotonAccion, Hoja } from '../ui';

const STOCK_BAJO = 3;

/** Repone stock de cada producto (sube el stock y deja registro para estadísticas). Lo más agotado va primero. */
export default function Reposicion({ barberiaId, onCambio }: { barberiaId: string; onCambio: () => void }) {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [elegido, setElegido] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState(10);
  const [costo, setCosto] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = () => supabase.from('productos').select('*').eq('barberia_id', barberiaId).order('stock').order('nombre')
    .then(({ data, error }) => error ? setError(msg(error)) : setProductos((data ?? []) as Producto[]));
  useEffect(() => { cargar(); }, [barberiaId]);

  function abrir(p: Producto) {
    setError(''); setOk('');
    setCantidad(10); setCosto('');
    setElegido(p);
  }

  async function reponer() {
    if (!elegido) return;
    setError('');
    const { data, error } = await supabase.rpc('reponer_stock', {
      p_producto: elegido.id, p_cantidad: cantidad, p_costo: costo.trim() ? Number(costo) : null,
    });
    if (error) return setError(msg(error));
    setOk(`${elegido.nombre}: stock ahora en ${data}.`);
    setElegido(null);
    cargar();
    onCambio();
  }

  return (
    <section className="grid gap-3">
      <h2 className="titulo text-lg">Reponer stock</h2>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && !elegido && <Aviso>{error}</Aviso>}
      <ul className="grid gap-2">
        {productos.map((p) => (
          <li key={p.id} className="neu-sm flex items-center gap-3 rounded-xl px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm">{p.nombre}</b>
              <span className={`text-xs ${p.stock <= 0 ? 'text-red-500' : p.stock <= STOCK_BAJO ? 'text-amber-500' : 'text-[var(--texto-suave)]'}`}>
                {p.stock <= 0 ? 'Agotado' : `Stock ${p.stock}`} · {soles(p.precio)}{!p.activo && ' · oculto'}
              </span>
            </span>
            <button type="button" onClick={() => abrir(p)} className="btn-acento min-h-11 shrink-0 gap-1.5 !px-3">
              <PackagePlus className="size-4" /> Reponer
            </button>
          </li>
        ))}
        {productos.length === 0 && <p className="text-sm text-base-400 py-4 text-center">Aún no hay productos para reponer.</p>}
      </ul>

      <Hoja abierta={!!elegido} onClose={() => setElegido(null)} titulo={elegido ? `Reponer ${elegido.nombre}` : 'Reponer'}>
        {elegido && (
          <div className="grid gap-4">
            <p className="text-sm text-[var(--texto-suave)]">Stock actual: <b className="text-[var(--texto)]">{elegido.stock}</b></p>
            <label><span className="etiqueta">Unidades que llegaron</span>
              <input type="number" inputMode="numeric" min={1} max={10000} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="campo" /></label>
            <label><span className="etiqueta">Costo por unidad (S/, opcional)</span>
              <input type="number" inputMode="decimal" min={0} step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} className="campo" placeholder="Para calcular el margen" /></label>
            <p className="text-sm">Quedará en <b>{elegido.stock + (cantidad || 0)}</b> unidades.</p>
            {error && <Aviso>{error}</Aviso>}
            <BotonAccion className="btn-acento min-h-12" onClick={reponer} disabled={!(cantidad >= 1)}>Confirmar reposición</BotonAccion>
          </div>
        )}
      </Hoja>
    </section>
  );
}
