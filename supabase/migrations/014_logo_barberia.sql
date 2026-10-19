-- Logo de cada barbería: se usa en la cabecera y en el icono de la app instalada.
alter table public.barberias add column if not exists logo_url text
  check (logo_url is null or logo_url ~ '^https://');
