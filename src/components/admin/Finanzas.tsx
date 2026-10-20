import { useEffect, useState } from 'react';
import { msg, supabase } from '@/lib/supabase';
import { hoyLima } from '@/lib/agenda';
import type { DatosBarberia } from '@/lib/useBarberia';
import { soles } from '@/lib/tipos';
import { Aviso } from '../ui';

interface Tx { monto: number; metodo_pago: string; destino_pago: string; comision_barbero: number; barbero_id: string | null; created_at: string }
interface Alquiler { barbero_id: string; mes: string; monto: number; pagado_at: string }
interface Gasto { id: string; concepto: string; categoria: string; monto: number; fecha: string }
const CATEGORIAS = ['ALQUILER', 'SERVICIOS', 'PRODUCTOS', 'SUELDOS', 'MARKETING', 'OTROS'] as const;

export default function Finanzas({ datos, recargar }: { datos: DatosBarberia; recargar: () => void }) {
  const { barberia, barberos } = datos;
  const [mes, setMes] = useState(hoyLima().slice(0, 7));
  const [tx, setTx] = useState<Tx[]>([]);
  const [alq, setAlq] = useState<Alquiler[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [modo, setModo] = useState(barberia.modo_financiero);
  const [comision, setComision] = useState(barberia.comision_pct);
  const [alquiler, setAlquiler] = useState(barberia.alquiler_mensual);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = async () => {
    const desde = new Date(`${mes}-01T00:00:00-05:00`);
    const hasta = new Date(desde); hasta.setMonth(hasta.getMonth() + 1);
    const [a, b] = await Promise.all([
      supabase.from('transacciones_pagos').select('monto, metodo_pago, destino_pago, comision_barbero, barbero_id, created_at')
        .eq('barberia_id', barberia.id).gte('created_at', desde.toISOString()).lt('created_at', hasta.toISOString()),
      supabase.from('alquileres').select('*').eq('barberia_id', barberia.id).eq('mes', `${mes}-01`),
    ]);
    setTx((a.data ?? []) as Tx[]); setAlq((b.data ?? []) as Alquiler[]);
    const g = await supabase.from('gastos').select('id, concepto, categoria, monto, fecha').eq('barberia_id', barberia.id)
      .gte('fecha', `${mes}-01`).lt('fecha', hasta.toISOString().slice(0, 10)).order('fecha', { ascending: false });
    setGastos((g.data ?? []) as Gasto[]);
  };
  useEffect(() => { cargar(); }, [mes]);

  async function guardar() {
    setError(''); setOk('');
    const { error } = await supabase.from('barberias').update({ modo_financiero: modo, comision_pct: comision, alquiler_mensual: alquiler }).eq('id', barberia.id);
    if (error) setError(msg(error)); else { setOk('Modelo financiero guardado ✅'); recargar(); }
  }
  async function cobrarAlquiler(barbero_id: string) {
    const { error } = await supabase.from('alquileres').insert({ barberia_id: barberia.id, barbero_id, mes: `${mes}-01`, monto: barberia.alquiler_mensual });
    if (error) setError(msg(error)); else cargar();
  }

  const total = tx.reduce((n, t) => n + Number(t.monto), 0);
  const comisiones = tx.filter((t) => t.destino_pago === 'DUEÑO').reduce((n, t) => n + Number(t.comision_barbero), 0);
  const porMetodo = ['EFECTIVO', 'YAPE', 'PLIN', 'TRANSFERENCIA'].map((m) => [m, tx.filter((t) => t.metodo_pago === m).reduce((n, t) => n + Number(t.monto), 0)] as const);
  const alquileresCobrados = alq.reduce((n, a) => n + Number(a.monto), 0);
  const gastosTotal = gastos.reduce((n, g) => n + Number(g.monto), 0);
  const netaDueno = (barberia.modo_financiero === 'CENTRALIZADO' ? total - comisiones : alquileresCobrados) - gastosTotal;

  async function agregarGasto(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    const { error } = await supabase.from('gastos').insert({
      barberia_id: barberia.id, concepto: String(f.get('concepto')).trim(), categoria: f.get('categoria'),
      monto: Number(f.get('monto')), fecha: `${mes}-01`,
    });
    if (error) setError(msg(error)); else { e.currentTarget.reset(); cargar(); }
  }
  async function borrarGasto(id: string) {
    const { error } = await supabase.from('gastos').delete().eq('id', id);
    if (error) setError(msg(error)); else cargar();
  }

  return (
    <div className="grid gap-6">
      <section data-ayuda="fin-modelo" className="neu rounded-2xl p-4 grid gap-4">
        <h3 className="titulo">Modelo financiero</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['CENTRALIZADO', 'A · Recaudación centralizada', 'Todo el dinero (Yape, Plin, efectivo) llega al dueño. El sistema calcula la comisión de cada barbero.'],
            ['INDIVIDUAL', 'B · Alquiler de silla', 'Cada barbero cobra lo suyo y valida sus propios Yapes. Paga una mensualidad fija por la silla.'],
          ] as const).map(([v, t, d]) => (
            <button key={v} onClick={() => setModo(v)} aria-pressed={modo === v}
              className="neu-sm neu-press rounded-xl p-3 text-left aria-pressed:neu-inset aria-pressed:ring-2 aria-pressed:ring-acento-500/60">
              <b className="text-sm block">{t}</b><span className="text-xs text-base-500">{d}</span>
            </button>
          ))}
        </div>
        {modo === 'CENTRALIZADO'
          ? <label className="text-sm flex items-center gap-2">Comisión por defecto para barberos <input type="number" min={0} max={100} className="campo !w-20" value={comision} onChange={(e) => setComision(+e.target.value)} />%</label>
          : <label className="text-sm flex items-center gap-2">Alquiler mensual por silla S/ <input type="number" min={0} step="10" className="campo !w-28" value={alquiler} onChange={(e) => setAlquiler(+e.target.value)} /></label>}
        <button className="btn-acento w-fit" onClick={guardar}>Guardar</button>
      </section>
      {error && <Aviso>{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <section data-ayuda="fin-reporte" className="grid gap-3">
        <div className="flex items-center gap-2">
          <h3 className="titulo">Reporte del mes</h3>
          <input type="month" className="campo !w-auto ml-auto" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="neu-inset rounded-xl p-3"><p className="text-lg font-semibold">{soles(total)}</p><p className="text-[11px] text-base-500">facturado</p></div>
          <div className="neu-inset rounded-xl p-3"><p className="text-lg font-semibold">{tx.length}</p><p className="text-[11px] text-base-500">atenciones</p></div>
          <div className="neu-inset rounded-xl p-3"><p className="text-lg font-semibold">{soles(comisiones)}</p><p className="text-[11px] text-base-500">comisiones a pagar</p></div>
          <div className="neu-inset rounded-xl p-3"><p className={`text-lg font-semibold ${netaDueno < 0 ? 'text-red-500' : 'text-emerald-500'}`}>{soles(netaDueno)}</p><p className="text-[11px] text-base-500">ganancia neta (menos gastos)</p></div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">{porMetodo.map(([m, v]) => <span key={m} className="chip">{m}: {soles(v)}</span>)}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-base-500"><th className="py-2">Barbero</th><th>Atenciones</th><th>Facturado</th><th>{barberia.modo_financiero === 'CENTRALIZADO' ? 'Comisión' : 'Alquiler del mes'}</th></tr></thead>
            <tbody>
              {barberos.map((b) => {
                const suyas = tx.filter((t) => t.barbero_id === b.id);
                const pagado = alq.find((a) => a.barbero_id === b.id);
                return (
                  <tr key={b.id} className="border-t border-base-300/30 dark:border-base-700/40">
                    <td className="py-2">{b.nombre}</td>
                    <td>{suyas.length}</td>
                    <td>{soles(suyas.reduce((n, t) => n + Number(t.monto), 0))}</td>
                    <td>{barberia.modo_financiero === 'CENTRALIZADO'
                      ? soles(suyas.reduce((n, t) => n + Number(t.comision_barbero), 0))
                      : pagado ? <span className="text-green-500">✅ {soles(pagado.monto)}</span>
                      : <button className="btn !py-1 text-xs" onClick={() => cobrarAlquiler(b.id)}>Registrar pago {soles(barberia.alquiler_mensual)}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section data-ayuda="fin-gastos" className="grid gap-3">
        <h3 className="titulo">Gastos del mes</h3>
        <form onSubmit={agregarGasto} className="panel grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <label><span className="etiqueta">Concepto</span><input name="concepto" required minLength={2} placeholder="Luz, alquiler del local…" className="campo" /></label>
          <label><span className="etiqueta">Categoría</span>
            <select name="categoria" className="campo">{CATEGORIAS.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}</select></label>
          <label><span className="etiqueta">Monto S/</span><input name="monto" type="number" min={0} step="0.5" required className="campo sm:!w-28" /></label>
          <button className="btn-acento">Agregar gasto</button>
        </form>
        <ul className="grid gap-2">
          {gastos.map((g) => (
            <li key={g.id} className="panel flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0">{g.concepto} <span className="text-xs text-[var(--texto-suave)]">· {g.categoria.toLowerCase()} · {g.fecha}</span></span>
              <b className="tabular-nums">{soles(g.monto)}</b>
              <button className="btn !py-1 text-xs text-red-500" onClick={() => borrarGasto(g.id)}>Quitar</button>
            </li>
          ))}
          {gastos.length === 0 && <li className="text-sm text-[var(--texto-suave)]">Sin gastos registrados este mes.</li>}
        </ul>
      </section>
    </div>
  );
}
