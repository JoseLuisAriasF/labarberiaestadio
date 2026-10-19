-- Fase 6: tema festivo configurable (Halloween, Navidad, Fiestas Patrias…)
-- 'auto' = el sitio decide por fecha; 'ninguno' = desactivado; o un tema fijo.
ALTER TABLE public.barberias
  ADD COLUMN IF NOT EXISTS tema_festivo text NOT NULL DEFAULT 'auto'
  CHECK (tema_festivo IN ('auto','ninguno','halloween','navidad','anio_nuevo','san_valentin','fiestas_patrias'));

-- El dueño puede cambiarlo desde el admin (privilegio por columna, como el resto).
GRANT UPDATE (tema_festivo) ON public.barberias TO authenticated;
