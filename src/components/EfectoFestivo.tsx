import { useMemo } from 'react';
import type { DefTema } from '@/lib/festivo';

/** Lluvia de emojis sobre la portada. Puro CSS (keyframe `caer-festivo`),
    sin assets ni interacción; se oculta con prefers-reduced-motion. */
export default function EfectoFestivo({ tema }: { tema: DefTema | null }) {
  const trozos = useMemo(
    () => !tema ? [] : Array.from({ length: 26 }, (_, i) => ({
      e: tema.emojis[i % tema.emojis.length],
      left: Math.random() * 100,
      dur: 6 + Math.random() * 9,
      delay: -Math.random() * 12,
      size: 14 + Math.random() * 20,
    })),
    [tema?.id],
  );
  if (!tema) return null;
  return (
    <div aria-hidden className="efecto-festivo">
      {trozos.map((t, i) => (
        <span key={i} style={{ left: `${t.left}%`, fontSize: `${t.size}px`, animationDuration: `${t.dur}s`, animationDelay: `${t.delay}s` }}>{t.e}</span>
      ))}
    </div>
  );
}
