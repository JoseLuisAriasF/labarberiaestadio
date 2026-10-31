import { useEffect, useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { crearCuentaCliente, entrarConCelular, entrarConGoogle } from '@/lib/useSesion';
import { msg, supabase } from '@/lib/supabase';
import { Aviso, BotonGoogle, Girando } from './ui';
import { GuiaReserva } from './GuiaReserva';

type Modo = 'entrar' | 'crear';

const params = () => new URLSearchParams(location.search);
// Solo rutas propias: evita que ?volver= mande a otro sitio.
const volverA = () => { const v = params().get('volver'); return v && v.startsWith('/') && !v.startsWith('//') ? v : null; };

export default function Acceso() {
  const [modo, setModo] = useState<Modo>(() => (params().get('modo') === 'crear' ? 'crear' : 'entrar'));
  // Viene de una reserva a medias: guía visible y, al terminar, vuelve a la reserva.
  const [volver] = useState(volverA);
  const [guia, setGuia] = useState(!!volver);
  useEffect(() => {
    if (volver) supabase.auth.getSession().then(({ data }) => data.session && location.replace(volver));
  }, []);
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
      location.href = volver ?? '/perfil';
    } catch (e) { setError(msg(e)); } finally { setEnviando(false); }
  }

  return (
    <div className="max-w-sm mx-auto grid gap-4">
      {guia && (
        <GuiaReserva paso={4} onOcultar={() => setGuia(false)}
          texto={modo === 'crear'
            ? 'Escribe tu nombre, tu celular y una clave que recuerdes. Toca «Crear mi cuenta» y volverás a tu reserva.'
            : 'Escribe tu celular y tu clave, y toca «Entrar». ¿Es tu primera vez? Toca «Soy nuevo» arriba.'} />
      )}
      <div className="neu rounded-3xl p-5 sm:p-6 grid gap-4">
        <div role="tablist" aria-label="Entrar o crear cuenta" className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[var(--superficie)] p-1.5">
          {([['entrar', 'Ya tengo cuenta', LogIn], ['crear', 'Soy nuevo', UserPlus]] as const).map(([m, t, I]) => (
            <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => { setModo(m); setError(''); }}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-bold transition-colors ${modo === m ? 'bg-acento-400 text-black shadow' : 'text-[var(--texto-suave)] hover:text-[var(--texto)]'}`}>
              <I className="size-5" /> {t}
            </button>
          ))}
        </div>
        <div className="text-center">
          <h1 className="titulo text-2xl">{modo === 'crear' ? 'Crea tu cuenta gratis' : 'Entra a tu cuenta'}</h1>
          <p className="mt-1.5 text-sm text-[var(--texto-suave)]">
            {modo === 'crear' ? 'Solo 3 datos. Tu celular será tu usuario.' : 'Usa el celular y la clave con los que te registraste.'}
          </p>
        </div>

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
            {modo === 'crear' && <span className="mt-1 block text-xs text-[var(--texto-suave)]">Mínimo 6 letras o números. Usa una que puedas recordar.</span>}
          </label>
          {error && <Aviso>{error}</Aviso>}
          <button disabled={enviando} className="btn-primario w-full" aria-busy={enviando}>
            {enviando ? <Girando className="size-5" /> : modo === 'crear' ? <UserPlus className="size-5" /> : <LogIn className="size-5" />}
            {modo === 'crear' ? 'Crear mi cuenta' : 'Entrar'}
          </button>
        </form>

        <div className="flex items-center gap-2 text-xs text-[var(--texto-suave)]"><span className="flex-1 border-t border-[var(--borde)]" />o también<span className="flex-1 border-t border-[var(--borde)]" /></div>
        <BotonGoogle onClick={entrarConGoogle} texto="Entrar con Google" />
        {volver && <a href={volver} className="text-center text-sm text-[var(--texto-suave)] underline underline-offset-4 py-1">← Volver a mi reserva</a>}
      </div>
    </div>
  );
}
