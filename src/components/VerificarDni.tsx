import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { msg, supabase } from '@/lib/supabase';
import { Aviso, Insignia } from './ui';

type Cli = { id: string; nombre: string | null; dni: string | null; telefono: string | null; estado_verificacion: string };

/** Verificación presencial: el staff busca al cliente por celular, nombre o DNI y lo marca 100% verificado. */
export default function VerificarDni() {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<Cli[] | null>(null);
  const [cliente, setCliente] = useState<Cli | null>(null);
  const [aviso, setAviso] = useState<{ t: 'ok' | 'error' | 'info'; m: string } | null>(null);

  async function buscar(texto: string) {
    setQ(texto); setCliente(null); setAviso(null);
    if (texto.trim().length < 2) return setResultados(null);
    const { data, error } = await supabase.rpc('buscar_clientes_staff', { p_q: texto.trim() });
    if (error) return setAviso({ t: 'error', m: msg(error) });
    setResultados((data ?? []) as Cli[]);
  }

  async function verificar() {
    if (!cliente) return;
    const { error } = await supabase.rpc('verificar_cliente_id', { p_cliente: cliente.id });
    if (error) return setAviso({ t: 'error', m: msg(error) });
    setCliente({ ...cliente, estado_verificacion: 'VERIFIED_100' });
    setAviso({ t: 'ok', m: 'Cliente verificado 100%. Ya puede reservar sin adelanto.' });
  }

  return (
    <section data-ayuda="clientes-verificar" className="neu rounded-2xl p-4 grid gap-3">
      <h3 className="titulo">🛡️ Verificar cliente</h3>
      <input className="campo" value={q} onChange={(e) => buscar(e.target.value)} autoComplete="off"
        placeholder="Celular, nombre o DNI" aria-label="Buscar cliente para verificar" />
      {resultados && resultados.length > 0 && !cliente && (
        <ul className="grid gap-1.5">
          {resultados.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => { setCliente(c); setResultados(null); }} className="panel w-full text-left">
                <b className="text-sm">{c.nombre ?? 'Sin nombre'}</b>
                <span className="block text-xs text-[var(--texto-suave)]">{c.telefono ?? 'Sin celular'}{c.dni ? ` · DNI ${c.dni}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {resultados && resultados.length === 0 && q.trim().length >= 2 && (
        <Aviso tipo="info">No hay ningún cliente con ese dato. Regístralo en "Nuevo corte" con su celular.</Aviso>
      )}
      {cliente && (
        <div className="flex flex-wrap items-center gap-3 neu-inset rounded-xl p-3">
          <span className="flex-1 text-sm">
            <b>{cliente.nombre ?? 'Sin nombre'}</b>
            <span className="block text-xs text-[var(--texto-suave)]">{cliente.telefono ?? 'Sin celular'}{cliente.dni ? ` · DNI ${cliente.dni}` : ''}</span>
          </span>
          <Insignia verificado={cliente.estado_verificacion === 'VERIFIED_100'} />
          {cliente.estado_verificacion !== 'VERIFIED_100' && <button className="btn-acento !py-1.5 text-xs" onClick={verificar}><ShieldCheck className="size-4" /> Verificar 100%</button>}
        </div>
      )}
      {aviso && <Aviso tipo={aviso.t}>{aviso.m}</Aviso>}
    </section>
  );
}
