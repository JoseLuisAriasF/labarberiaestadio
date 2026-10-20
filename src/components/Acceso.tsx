import { useState } from 'react';
import { crearCuentaCliente, entrarConCelular, entrarConGoogle } from '@/lib/useSesion';
import { msg } from '@/lib/supabase';
import { Aviso, BotonGoogle, Girando } from './ui';

type Modo = 'entrar' | 'crear';

export default function Acceso() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [nombre, setNombre] = useState('');
  const [celular, setCelular] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      const tel = celular.replace(/\D/g, '');
      if (tel.length < 6) throw new Error('El celular no es válido');
      if (clave.length < 6) throw new Error('La clave debe tener al menos 6 caracteres');
      const { error } = modo === 'crear'
        ? await crearCuentaCliente(nombre.trim(), tel, clave)
        : await entrarConCelular(tel, clave);
      if (error) {
        const t = error.message;
        if (/already registered|user_already_exists/i.test(t)) throw new Error('Este celular ya tiene cuenta. Entra con tu clave.');
        if (/invalid/i.test(t)) throw new Error('Celular o clave incorrectos');
        throw error;
      }
      location.href = '/perfil';
    } catch (e) { setError(msg(e)); } finally { setEnviando(false); }
  }

  return (
    <div className="max-w-sm mx-auto neu rounded-3xl p-6 grid gap-4">
      <h1 className="titulo text-xl text-center">{modo === 'crear' ? 'Crear tu cuenta' : 'Entrar a tu cuenta'}</h1>
      <p className="text-sm text-base-500 text-center">Usas tu <b>celular</b> como usuario. Añades tu correo después, si quieres recibir avisos.</p>

      <BotonGoogle onClick={entrarConGoogle} texto="Continuar con Google" />
      <div className="flex items-center gap-2 text-xs text-base-500"><span className="flex-1 border-t border-[var(--borde)]" />o con celular<span className="flex-1 border-t border-[var(--borde)]" /></div>

      <form onSubmit={enviar} className="grid gap-3">
        {modo === 'crear' && (
          <label><span className="etiqueta">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" className="campo" placeholder="Ej. Carlos" />
          </label>
        )}
        <label><span className="etiqueta">Celular</span>
          <input value={celular} onChange={(e) => setCelular(e.target.value)} required inputMode="tel" autoComplete="tel" pattern="[0-9 +]{6,15}" className="campo" placeholder="9xx xxx xxx" />
        </label>
        <label><span className="etiqueta">Clave</span>
          <span className="relative block">
            <input value={clave} onChange={(e) => setClave(e.target.value)} required minLength={6} type={verClave ? 'text' : 'password'}
              autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} className="campo pr-20" />
            <button type="button" onClick={() => setVerClave((v) => !v)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-9 rounded-lg px-2.5 text-xs font-semibold text-[var(--texto-suave)] hover:text-[var(--texto)]">
              {verClave ? 'Ocultar' : 'Mostrar'}
            </button>
          </span>
        </label>
        {error && <Aviso>{error}</Aviso>}
        <button disabled={enviando} className="btn-acento" aria-busy={enviando}>
          {enviando && <Girando />}{modo === 'crear' ? 'Crear cuenta' : 'Entrar'}
        </button>
      </form>

      <p className="text-xs text-center text-base-500">
        {modo === 'crear'
          ? <>¿Ya tienes cuenta? <button className="text-acento-500 underline underline-offset-4" onClick={() => { setModo('entrar'); setError(''); }}>Entrar</button></>
          : <>¿Primera vez? <button className="text-acento-500 underline underline-offset-4" onClick={() => { setModo('crear'); setError(''); }}>Crear cuenta</button></>}
      </p>
    </div>
  );
}
