import { useState } from 'react';
import { KeyRound, Plus, Upload } from 'lucide-react';
import { msg, subirImagen, supabase } from '@/lib/supabase';
import type { DatosBarberia } from '@/lib/useBarberia';
import type { Barbero } from '@/lib/tipos';
import { ESTADOS } from '@/lib/tipos';
import { Aviso, Hoja } from '../ui';

/** Llama a la Pages Function con el JWT del dueño (ella valida que lo sea). */
export async function staff(accion: string, datos: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch('/api/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ accion, ...datos }),
  }).then((x) => x.json()).catch(() => ({ error: 'Sin conexión' }));
  if (r.error) throw new Error(r.error);
  return r;
}

const claveAleatoria = () => {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `Corte${(r[0] % 9000) + 1000}${r[1].toString(36).slice(0, 4)}`;
};

export default function Equipo({ datos, recargar }: { datos: DatosBarberia; recargar: () => void }) {
  const { barberia, barberos } = datos;
  const [nuevo, setNuevo] = useState(false);
  const [credencial, setCredencial] = useState<{ usuario: string; clave: string } | null>(null);
  const [error, setError] = useState('');

  async function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setError('');
    try {
      await staff('crear', { barberia_id: barberia.id, ...f });
      setNuevo(false);
      setCredencial({ usuario: f.usuario, clave: f.clave });
      recargar();
    } catch (e) { setError(msg(e)); }
  }
  async function resetear(b: Barbero) {
    const clave = claveAleatoria();
    if (!confirm(`¿Generar clave temporal nueva para ${b.nombre}?`)) return;
    try { await staff('clave', { barberia_id: barberia.id, barbero_id: b.id, clave }); setCredencial({ usuario: b.usuario, clave }); }
    catch (e) { setError(msg(e)); }
  }
  async function activo(b: Barbero) {
    try { await staff('activo', { barberia_id: barberia.id, barbero_id: b.id, activo: !b.activo }); recargar(); }
    catch (e) { setError(msg(e)); }
  }
  async function actualizar(b: Barbero, cambios: Partial<Barbero>) {
    const { error } = await supabase.from('barberos').update(cambios).eq('id', b.id);
    if (error) setError(msg(error)); else recargar();
  }
  async function avatar(b: Barbero, archivo?: File) {
    if (!archivo) return;
    try { await actualizar(b, { avatar_url: (await subirImagen('publico', `${barberia.id}/avatares`, archivo)).url }); }
    catch (e) { setError(msg(e)); }
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="titulo text-lg">Barberos</h2>
        <button className="btn-acento" onClick={() => setNuevo(true)}><Plus className="size-4" /> Nuevo barbero</button>
      </div>
      {error && <Aviso>{error}</Aviso>}
      {credencial && (
        <Aviso tipo="ok">
          Entrega estos datos al barbero: código <b>{barberia.codigo}</b> · usuario <b>{credencial.usuario}</b> · clave temporal <b className="select-all">{credencial.clave}</b>.
          Deberá cambiarla en su primer ingreso.
        </Aviso>
      )}
      <ul className="grid gap-2">
        {barberos.map((b) => (
          <li key={b.id} className={`neu-sm rounded-xl p-3 flex flex-wrap items-center gap-3 ${b.activo ? '' : 'opacity-50'}`}>
            <label className="relative cursor-pointer shrink-0" title="Cambiar foto">
              {b.avatar_url ? <img src={b.avatar_url} alt="" className="size-12 rounded-full object-cover" />
                : <span className="size-12 rounded-full grid place-items-center bg-acento-500 text-white font-bold">{b.nombre.slice(0, 2).toUpperCase()}</span>}
              <Upload className="size-4 absolute -bottom-1 -right-1 neu-sm rounded-full p-0.5" />
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => avatar(b, e.target.files?.[0])} />
            </label>
            <span className="flex-1 min-w-40">
              <b className="block text-sm">{b.nombre}</b>
              <span className="text-xs text-base-500">@{b.usuario} · {ESTADOS[b.estado].emoji} {ESTADOS[b.estado].texto}{b.debe_cambiar_clave && ' · ⚠️ clave temporal'}</span>
              {(b.email_real || b.telefono_real || b.whatsapp) && (
                <span className="block text-xs text-base-400">{[b.email_real, b.telefono_real && `📱${b.telefono_real}`, b.whatsapp && `WA:${b.whatsapp}`].filter(Boolean).join(' · ')}</span>
              )}
            </span>
            {barberia.modo_financiero === 'CENTRALIZADO' && (
              <label className="text-xs flex items-center gap-1">Comisión
                <input type="number" min={0} max={100} className="campo !w-16 !py-1" defaultValue={b.comision_pct ?? ''} placeholder={String(barberia.comision_pct)}
                  onBlur={(e) => actualizar(b, { comision_pct: e.target.value === '' ? null : Number(e.target.value) })} />%
              </label>
            )}
            <button className="btn !py-1 text-xs" onClick={() => resetear(b)}><KeyRound className="size-3" /> Clave</button>
            <button className="btn !py-1 text-xs" onClick={() => activo(b)}>{b.activo ? 'Dar de baja' : 'Reactivar'}</button>
          </li>
        ))}
        {barberos.length === 0 && <p className="text-sm text-base-400 text-center py-6">Crea a tu primer barbero.</p>}
      </ul>

      <Hoja abierta={nuevo} onClose={() => setNuevo(false)} titulo="Nuevo barbero">
        <form onSubmit={crear} className="grid gap-3">
          <label><span className="etiqueta">Nombre visible</span><input name="nombre" required minLength={2} maxLength={60} className="campo" /></label>
          <label><span className="etiqueta">Usuario (para el login)</span><input name="usuario" required pattern="[a-z0-9_]{3,24}" autoCapitalize="none" className="campo" placeholder="ej. carlos" /></label>
          <label><span className="etiqueta">Clave temporal</span><input name="clave" required minLength={8} defaultValue={claveAleatoria()} className="campo font-mono" /></label>
          <label><span className="etiqueta">Email (para notificaciones)</span><input name="email_real" type="email" className="campo" placeholder="barbero@gmail.com" /></label>
          <label><span className="etiqueta">Teléfono</span><input name="telefono_real" type="tel" className="campo" placeholder="987654321" /></label>
          <label><span className="etiqueta">WhatsApp (para citas)</span><input name="whatsapp" type="tel" className="campo" placeholder="51987654321" /></label>
          <p className="text-xs text-base-500">El barbero entra con código <b>{barberia.codigo}</b> + usuario + esta clave, y el sistema le obliga a cambiarla.</p>
          {error && <Aviso>{error}</Aviso>}
          <button className="btn-acento">Crear barbero</button>
        </form>
      </Hoja>
    </section>
  );
}
