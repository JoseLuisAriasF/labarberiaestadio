-- El logo de la barbería (014) nunca tuvo permiso de escritura: el dueño no podía guardarlo
-- y el error salía como "No tienes permiso". Se concede la columna al dueño y a quien tenga "local".
grant update (logo_url) on public.barberias to authenticated;
