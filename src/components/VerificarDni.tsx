import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { msg, supabase } from '@/lib/supabase';
import { Aviso, Insignia } from './ui';

/** Método B anti-trolls: el staff marca 100% verificado a un cliente conocido por su DNI. */
export default function VerificarDni() {
  const [dni, setDni] = useState('');
  const [cliente, setCliente] = useState<{ nombre: string | null; dni: string; estado_verificacion: string } | null>(null);
  const [aviso, setAviso] = useState<{ t: 'ok' | 'error' | 'info'; m: string } | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null); setCliente(null);
    const { data, error } = await supabase.rpc('buscar_cliente_dni', { p_dni: dni });
    if (error) return setAviso({ t: 'error', m: msg(error) });
    if (!data?.length) return setAviso({ t: 'info', m: 'No hay cliente con ese DNI. Pídele que entre a la web con Google y registre su DNI.' });
    setCliente(data[0]);
  }
  async function verificar() {
    const { error } = await supabase.rpc('verificar_cliente_dni', { p_dni: dni });
    if (error) return setAviso({ t: 'error', m: msg(error) });
    setCliente((c) => c && { ...c, estado_verificacion: 'VERIFIED_100' });
    setAviso({ t: 'ok', m: 'Cliente verificado 100%. Ya puede reservar sin adelanto.' });
  }

  return (
    <section className="neu rounded-2xl p-4 grid gap-3">
      <h3 className="titulo">🛡️ Verificar cliente por DNI</h3>
      <form onSubmit={buscar} className="flex gap-2">
        <input className="campo" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required placeholder="DNI (8 dígitos)" value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))} />
        <button className="btn">Buscar</button>
      </form>
      {cliente && (
        <div className="flex flex-wrap items-center gap-3 neu-inset rounded-xl p-3">
          <span className="flex-1 text-sm"><b>{cliente.nombre}</b> · DNI {cliente.dni}</span>
          <Insignia verificado={cliente.estado_verificacion === 'VERIFIED_100'} />
          {cliente.estado_verificacion !== 'VERIFIED_100' && <button className="btn-acento !py-1.5 text-xs" onClick={verificar}><ShieldCheck className="size-4" /> Verificar 100% por DNI</button>}
        </div>
      )}
      {aviso && <Aviso tipo={aviso.t}>{aviso.m}</Aviso>}
    </section>
  );
}
