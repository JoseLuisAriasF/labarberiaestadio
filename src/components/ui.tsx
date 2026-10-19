import { AnimatePresence, motion } from 'motion/react';
import { Upload, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { msg, supabase } from '@/lib/supabase';
import type { Cliente } from '@/lib/tipos';

/** Hoja inferior en móvil, diálogo centrado en escritorio. Esc y fondo cierran. */
export function Hoja({ abierta, onClose, titulo, children, ancho = 'sm:max-w-lg' }: {
  abierta: boolean; onClose: () => void; titulo: string; children: ReactNode; ancho?: string;
}) {
  useEffect(() => {
    if (!abierta) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [abierta, onClose]);
  return (
    <AnimatePresence>
      {abierta && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-label={titulo}
            className={`neu w-full ${ancho} max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]`}
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 gap-3">
              <h2 className="titulo text-lg">{titulo}</h2>
              <button onClick={onClose} className="btn !p-2" aria-label="Cerrar"><X className="size-4" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const c = { error: 'text-red-500', ok: 'text-green-600 dark:text-green-400', info: 'text-base-500' }[tipo];
  return <p role={tipo === 'error' ? 'alert' : 'status'} className={`neu-inset rounded-xl px-3 py-2 text-sm ${c}`}>{children}</p>;
}

export function Insignia({ verificado }: { verificado: boolean }) {
  return verificado
    ? <span className="chip text-green-600 dark:text-green-400">✅ 100% verificado</span>
    : <span className="chip text-amber-500">⏳ No verificado</span>;
}

/** Paso obligatorio tras Google: DNI (8 dígitos), nombre y teléfono. */
export function RegistroDni({ email, onListo }: { email?: string; onListo: (c: Cliente) => void }) {
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnviando(true); setError('');
    const { data, error } = await supabase.rpc('registrar_cliente', {
      p_dni: String(f.get('dni')).trim(), p_nombre: String(f.get('nombre')).trim(), p_telefono: String(f.get('telefono')).trim(),
    });
    setEnviando(false);
    if (error) return setError(msg(error));
    onListo(data as Cliente);
  }
  return (
    <form onSubmit={enviar} className="grid gap-3">
      <p className="text-sm text-base-500">Conectado como <b>{email}</b>. Para evitar reservas falsas pedimos tu DNI una sola vez.</p>
      <label><span className="etiqueta">DNI</span>
        <input name="dni" required inputMode="numeric" pattern="[0-9]{8}" maxLength={8} autoComplete="off" className="campo" placeholder="8 dígitos" /></label>
      <label><span className="etiqueta">Nombre</span>
        <input name="nombre" required minLength={2} maxLength={60} autoComplete="name" className="campo" /></label>
      <label><span className="etiqueta">Celular (opcional)</span>
        <input name="telefono" type="tel" inputMode="tel" pattern="\+?[0-9 ]{6,15}" autoComplete="tel" className="campo" placeholder="9xx xxx xxx" /></label>
      {error && <Aviso>{error}</Aviso>}
      <button disabled={enviando} className="btn-acento">{enviando ? 'Guardando…' : 'Continuar'}</button>
    </form>
  );
}

export function BotonGoogle({ onClick, texto = 'Continuar con Google' }: { onClick: () => void; texto?: string }) {
  return (
    <button onClick={onClick} className="btn w-full">
      <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      {texto}
    </button>
  );
}

/** Subida de imagen visible en celular: recuadro, icono y texto (no un input escondido). */
export function CampoImagen({ name, texto = 'Subir imagen', actual, onChange }: {
  name?: string; texto?: string; actual?: string | null; onChange?: (f?: File) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-acento-500/60 bg-acento-500/5 px-3 py-2.5 transition-colors hover:bg-acento-500/10">
      {actual
        ? <img src={actual} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
        : <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-acento-500 text-black"><Upload className="size-5" /></span>}
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-acento-400">{actual ? 'Cambiar imagen' : texto}</span>
        <span className="block text-xs text-[var(--texto-suave)]">JPG, PNG o WEBP · máx. 5 MB</span>
      </span>
      <input type="file" name={name} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onChange?.(e.target.files?.[0])} />
    </label>
  );
}

/** Bloque gris que pulsa mientras carga: la pantalla se ve viva antes de llegar los datos. */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-[var(--borde)] ${className}`} />;
}

export function Girando({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Botón que muestra un giro y se bloquea mientras su acción no termina (no parece congelado). */
export function BotonAccion({ onClick, children, className = 'btn', disabled }: {
  onClick: () => unknown; children: ReactNode; className?: string; disabled?: boolean;
}) {
  const [enCurso, setEnCurso] = useState(false);
  return (
    <button type="button" className={className} disabled={enCurso || disabled} aria-busy={enCurso}
      onClick={async () => {
        setEnCurso(true);
        try { await onClick(); } finally { setEnCurso(false); }
      }}>
      {enCurso && <Girando />}{children}
    </button>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p className="text-sm text-base-400 animate-pulse py-8 text-center">{texto}</p>;
}
