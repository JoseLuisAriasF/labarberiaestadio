import { useEffect, useState } from 'react';
import { msg, supabase } from '@/lib/supabase';
import { hoyLima } from '@/lib/agenda';
import type { DatosBarberia } from '@/lib/useBarberia';
import { soles } from '@/lib/tipos';
import { Aviso } from '../ui';

interface Tx { monto: number; metodo_pago: string; destino_pago: string; comision_barbero: number; barbero_id: string | null; created_at: string }
interface Alquiler { barbero_id: string; mes: string; monto: number; pagado_at: string }

export default function Finanzas({ datos, recargar }: { datos: DatosBarberia; recargar: () => void }) {
  const { barberia, barberos } = datos;
  const [mes, setMes] = useState(hoyLima().slice(0, 7));
  const [tx, setTx] = useState<Tx[]>([]);
  const [alq, setAlq] = useState<Alquiler[]>([]);
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

  return (
    <div className="grid gap-6">
      <section className="neu rounded-2xl p-4 grid gap-4">
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

      <section className="grid gap-3">
        <div className="flex items-center gap-2">
          <h3 className="titulo">Reporte del mes</h3>
          <input type="month" className="campo !w-auto ml-auto" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="neu-inset rounded-xl p-3"><p className="text-lg font-semibold">{soles(total)}</p><p className="text-[11px] text-base-500">facturado</p></div>
          <div className="neu-inset rounded-xl p-3"><p className="text-lg font-semibold">{tx.length}</p><p className="text-[11px] text-base-500">atenciones</p></div>
          <div className="neu-inset rounded-xl p-3"><p className="text-lg font-semibold">{soles(comisiones)}</p><p className="text-[11px] text-base-500">comisiones a pagar</p></div>
          <div className="neu-inset rounded-xl p-3"><p className="text-lg font-semibold">{soles(barberia.modo_financiero === 'CENTRALIZADO' ? total - comisiones : alquileresCobrados)}</p><p className="text-[11px] text-base-500">ganancia dueño</p></div>
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
    </div>
  );
}
