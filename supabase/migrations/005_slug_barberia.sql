-- Subdominio de cada barbería: elestadiobarberia.pages.dev → slug "elestadiobarberia".
alter table public.barberias
  add column if not exists slug text unique
  check (slug ~ '^[a-z0-9-]{3,40}$');
