import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { msg, supabase } from '@/lib/supabase';
import type { Producto } from '@/lib/tipos';
import { soles } from '@/lib/tipos';
import { Aviso, BotonAccion, Cargando, Hoja } from '../ui';

type Metodo = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TRANSFERENCIA';
const METODOS: { v: Metodo; t: string; emoji: string }[] = [
  { v: 'EFECTIVO', t: 'Efectivo', emoji: '💵' },
  { v: 'YAPE', t: 'Yape', emoji: '📱' },
  { v: 'PLIN', t: 'Plin', emoji: '📲' },
  { v: 'TRANSFERENCIA', t: 'Transferencia', emoji: '🏦' },
];
const STOCK_BAJO = 3;

/** Caja del barbero: toca para sumar, cobra y el stock baja al instante. Pensada para el celular. */
export default function Vender({ barberiaId, barberoId }: { barberiaId: string; barberoId: string }) {
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [cobrando, setCobrando] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Tras cada cambio de stock (propio o de otro barbero) el carrito se ajusta a lo que queda.
  async function cargar() {
    const { data, error } = await supabase.from('productos').select('*')
      .eq('barberia_id', barberiaId).eq('activo', true).order('nombre');
    if (error) return setError(msg(error));
    const lista = (data ?? []) as Producto[];
    setProductos(lista);
    setCarrito((c) => Object.fromEntries(
      Object.entries(c)
        .map(([id, n]) => [id, Math.min(n, lista.find((p) => p.id === id)?.stock ?? 0)] as const)
        .filter(([, n]) => n > 0)));
  }
  useEffect(() => { cargar(); }, [barberiaId]);

  const lineas = useMemo(() => (productos ?? []).filter((p) => carrito[p.id] > 0).map((p) => ({ p, n: carrito[p.id] })), [productos, carrito]);
  const total = lineas.reduce((s, { p, n }) => s + p.precio * n, 0);
  const unidades = lineas.reduce((s, { n }) => s + n, 0);

  function ajustar(p: Producto, delta: number) {
    setOk('');
    if ('vibrate' in navigator) navigator.vibrate(15);
    setCarrito((c) => ({ ...c, [p.id]: Math.min(p.stock, Math.max(0, (c[p.id] ?? 0) + delta)) }));
  }

  async function cobrar() {
    setError('');
    const items = lineas.map(({ p, n }) => ({ producto_id: p.id, cantidad: n }));
    const { error } = await supabase.rpc('vender_productos', { p_barbero: barberoId, p_items: items, p_metodo: metodo });
    if (error) { setError(msg(error)); await cargar(); return; }
    if ('vibrate' in navigator) navigator.vibrate([40, 40, 40]);
    setOk(`Venta cobrada: ${soles(total)} en ${METODOS.find((m) => m.v === metodo)?.t.toLowerCase()}.`);
    setCarrito({});
    setCobrando(false);
    cargar();
  }

  if (productos === null) return error ? <Aviso>{error}</Aviso> : <Cargando texto="Cargando productos…" />;

  return (
    <section className="grid gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="titulo text-lg">Vender productos</h2>
        <span className="text-xs text-[var(--texto-suave)]">Se descuenta el stock al cobrar</span>
      </div>
      {ok && <Aviso tipo="ok">{ok}</Aviso>}
      {error && !cobrando && <Aviso>{error}</Aviso>}

      {productos.length === 0 ? (
        <p className="text-sm text-[var(--texto-suave)] text-center py-8">Aún no hay productos publicados. El dueño los agrega en Productos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {productos.map((p) => {
            const n = carrito[p.id] ?? 0;
            const agotado = p.stock <= 0;
            const tope = n >= p.stock;
            return (
              <li key={p.id} className={`neu-sm flex flex-col overflow-hidden rounded-2xl ${agotado ? 'opacity-50' : ''}`}>
                <button type="button" disabled={agotado || tope} onClick={() => ajustar(p, 1)}
                  aria-label={`Agregar ${p.nombre}`}
                  className="grid flex-1 gap-2 p-3 text-left transition active:scale-[0.97] disabled:active:scale-100">
                  {p.imagen_url
                    ? <img src={p.imagen_url} alt="" loading="lazy" className="h-20 w-full rounded-xl object-cover" />
                    : <span aria-hidden="true" className="grid h-20 place-items-center rounded-xl bg-acento-500/10 text-3xl">📦</span>}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                    <span className="block text-base font-bold tabular-nums text-acento-400">{soles(p.precio)}</span>
                  </span>
                  <span className={`justify-self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${agotado ? 'bg-red-500/15 text-red-500' : p.stock <= STOCK_BAJO ? 'bg-amber-500/15 text-amber-500' : 'bg-[var(--borde)] text-[var(--texto-suave)]'}`}>
                    {agotado ? 'Agotado' : p.stock <= STOCK_BAJO ? `¡Quedan ${p.stock}!` : `Stock ${p.stock}`}
                  </span>
                </button>
                {n > 0 && (
                  <div className="flex items-center justify-between border-t border-[var(--borde)] px-1 py-1">
                    <button type="button" aria-label={`Quitar uno de ${p.nombre}`} onClick={() => ajustar(p, -1)} className="grid size-11 place-items-center rounded-xl active:bg-acento-500/15"><Minus className="size-5" /></button>
                    <b className="text-lg tabular-nums" aria-live="polite">{n}</b>
                    <button type="button" aria-label={`Agregar otro ${p.nombre}`} onClick={() => ajustar(p, 1)} disabled={tope} className="grid size-11 place-items-center rounded-xl active:bg-acento-500/15 disabled:opacity-30"><Plus className="size-5" /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {unidades > 0 && (
        <div className="fixed inset-x-3 bottom-20 z-30 flex items-center gap-3 rounded-2xl bg-[var(--superficie)] p-3 shadow-xl ring-1 ring-[var(--borde)] sm:static sm:z-auto sm:shadow-none sm:ring-0">
          <span className="min-w-0 flex-1 text-sm">
            <span className="block text-[var(--texto-suave)]">{unidades} {unidades === 1 ? 'producto' : 'productos'}</span>
            <span className="block text-xl font-bold tabular-nums">{soles(total)}</span>
          </span>
          <button type="button" onClick={() => { setError(''); setCobrando(true); }} className="btn-acento min-h-12 shrink-0 px-6">Cobrar</button>
        </div>
      )}

      <Hoja abierta={cobrando} onClose={() => setCobrando(false)} titulo="Cobrar venta">
        <div className="grid gap-4 text-sm">
          <ul className="grid gap-1.5">
            {lineas.map(({ p, n }) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{n} × {p.nombre}</span>
                <b className="shrink-0 tabular-nums">{soles(p.precio * n)}</b>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-[var(--borde)] pt-3 text-base">
            <b>Total</b><b className="text-xl tabular-nums">{soles(total)}</b>
          </div>
          <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-2 gap-2">
            {METODOS.map((m) => (
              <button key={m.v} type="button" role="radio" aria-checked={metodo === m.v} onClick={() => setMetodo(m.v)}
                className="min-h-12 rounded-xl border border-[var(--borde)] bg-[var(--tarjeta)] px-3 text-sm font-semibold aria-checked:border-acento-500 aria-checked:bg-acento-500 aria-checked:text-black">
                {m.emoji} {m.t}
              </button>
            ))}
          </div>
          {error && <Aviso>{error}</Aviso>}
          <BotonAccion className="btn-acento min-h-12" onClick={cobrar} disabled={lineas.length === 0}>Cobrar {soles(total)}</BotonAccion>
        </div>
      </Hoja>
    </section>
  );
}
