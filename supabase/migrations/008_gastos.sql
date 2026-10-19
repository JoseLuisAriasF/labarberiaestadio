-- Gastos del local (luz, alquiler, productos, sueldos…). Solo los ve el dueño.
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  concepto text not null check (char_length(concepto) between 2 and 80),
  categoria text not null default 'OTROS' check (categoria in ('ALQUILER', 'SERVICIOS', 'PRODUCTOS', 'SUELDOS', 'MARKETING', 'OTROS')),
  monto numeric(10, 2) not null check (monto >= 0),
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.gastos enable row level security;
drop policy if exists "dueño gestiona sus gastos" on public.gastos;
create policy "dueño gestiona sus gastos" on public.gastos for all
  using (public.es_dueno(barberia_id)) with check (public.es_dueno(barberia_id));
