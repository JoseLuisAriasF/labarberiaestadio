-- ═══════════════════════════════════════════════════════════════════════════
-- La Barbería Estadio · SaaS multi-barbería
-- Pegar entero en Supabase → SQL Editor. Idempotente en lo posible.
--
-- Regla de oro: el navegador habla directo con la BD (anon key), así que la
-- seguridad vive AQUÍ. Lecturas por RLS; toda escritura sensible (reservar,
-- aprobar pagos, verificar clientes, estados) pasa por funciones
-- SECURITY DEFINER que validan quién llama. Nada confía en el frontend.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists btree_gist;

do $$ begin
  create type public.modo_financiero   as enum ('CENTRALIZADO','INDIVIDUAL');
  create type public.modo_gamificacion as enum ('GLOBAL','POR_BARBERO');
  create type public.estado_barbero    as enum ('LIBRE','CORTANDO_CITA','CORTANDO_WALKIN','DESCANSO');
  create type public.estado_verificacion as enum ('UNVERIFIED','VERIFIED_100');
  create type public.estado_cita as enum ('PENDIENTE_PAGO','CONFIRMADA','EN_COLA','EN_CURSO','COMPLETADA','CANCELADA','RECHAZADA','NO_ASISTIO');
  create type public.metodo_pago  as enum ('YAPE','PLIN','EFECTIVO','TRANSFERENCIA');
  create type public.destino_pago as enum ('DUEÑO','BARBERO');
  create type public.tipo_premio  as enum ('DESCUENTO','GRATIS');
exception when duplicate_object then null; end $$;

-- ─── Tablas ────────────────────────────────────────────────────────────────

create sequence if not exists public.barberia_codigo_seq;

create table if not exists public.barberias (
  id uuid primary key default gen_random_uuid(),
  -- B1, B2, … BN. Una secuencia: único y sin carreras, sin código en la app.
  codigo text unique not null default 'B' || nextval('public.barberia_codigo_seq'),
  nombre text not null check (char_length(nombre) between 2 and 80),
  owner_id uuid references auth.users on delete set null,
  email_contacto text,
  telefono text,
  whatsapp text,
  descripcion text check (char_length(descripcion) <= 600),
  direccion text,
  referencia text,
  distrito text,
  ciudad text default 'Lima',
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  -- {"1":["09:00","21:00"], … "7":null}  (1 = lunes, ISO)
  horario jsonb not null default '{"1":["09:00","21:00"],"2":["09:00","21:00"],"3":["09:00","21:00"],"4":["09:00","21:00"],"5":["09:00","21:00"],"6":["09:00","21:00"],"7":null}',
  fotos jsonb not null default '[]',
  modo_financiero public.modo_financiero not null default 'CENTRALIZADO',
  modo_gamificacion public.modo_gamificacion not null default 'GLOBAL',
  comision_pct numeric(5,2) not null default 50 check (comision_pct between 0 and 100),
  alquiler_mensual numeric(10,2) not null default 0 check (alquiler_mensual >= 0),
  yape_numero text,
  plin_numero text,
  titular_pago text,
  qr_pago_url text,
  plan text not null default 'TRIAL' check (plan in ('TRIAL','ACTIVO','SUSPENDIDO')),
  trial_ends_at timestamptz not null default now() + interval '90 days',
  created_at timestamptz not null default now()
);

create table if not exists public.pisos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  numero_piso int not null check (numero_piso between 1 and 50),
  nombre text,
  unique (barberia_id, numero_piso)
);

create table if not exists public.barberos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid unique references auth.users on delete set null,
  barberia_id uuid not null references public.barberias on delete cascade,
  usuario text not null check (usuario ~ '^[a-z0-9_]{3,24}$'),
  nombre text not null check (char_length(nombre) between 2 and 60),
  avatar_url text,
  bio text check (char_length(bio) <= 300),
  especialidades_bestseller jsonb not null default '[]',
  horario_atencion jsonb not null default '{"1":["09:00","20:00"],"2":["09:00","20:00"],"3":["09:00","20:00"],"4":["09:00","20:00"],"5":["09:00","20:00"],"6":["09:00","20:00"],"7":null}',
  estado public.estado_barbero not null default 'LIBRE',
  estado_desde timestamptz not null default now(),
  estado_hasta timestamptz,          -- fin estimado del corte (timer 3D)
  cola int not null default 0,       -- lo mantiene un trigger (ver abajo)
  comision_pct numeric(5,2) check (comision_pct between 0 and 100), -- null = la de la barbería
  yape_numero text,
  plin_numero text,
  debe_cambiar_clave boolean not null default true,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (barberia_id, usuario)
);

create table if not exists public.sillas (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  piso_id uuid not null references public.pisos on delete cascade,
  posicion_x numeric(5,2) not null default 0,
  posicion_z numeric(5,2) not null default 0,
  rotacion numeric(6,2) not null default 0,
  barbero_id uuid unique references public.barberos on delete set null
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid unique not null references auth.users on delete cascade,
  nombre text,
  email text,
  telefono text check (telefono ~ '^\+?[0-9 ]{6,15}$'),
  dni text unique not null check (dni ~ '^[0-9]{8}$'),
  estado_verificacion public.estado_verificacion not null default 'UNVERIFIED',
  registrado_por_barbero_id uuid references public.barberos on delete set null,
  verificado_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.servicios_cortes (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 60),
  descripcion text,
  precio_base numeric(10,2) not null check (precio_base >= 0),
  duracion_min int not null check (duracion_min between 5 and 480),
  foto_url text,
  activo boolean not null default true
);

create table if not exists public.barbero_servicios (
  barbero_id uuid not null references public.barberos on delete cascade,
  servicio_id uuid not null references public.servicios_cortes on delete cascade,
  es_bestseller boolean not null default false,
  primary key (barbero_id, servicio_id)
);

create table if not exists public.gamificacion_premios (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  barbero_id uuid references public.barberos on delete cascade, -- null = toda la barbería
  meta_cortes int not null check (meta_cortes between 1 and 100),
  tipo_premio public.tipo_premio not null,
  valor_descuento numeric(5,2) not null default 0 check (valor_descuento between 0 and 100),
  descripcion text,
  activo boolean not null default true
);

create table if not exists public.gamificacion_vouchers (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete cascade,
  barberia_id uuid not null references public.barberias on delete cascade,
  barbero_id uuid references public.barberos on delete set null,
  premio_id uuid references public.gamificacion_premios on delete set null,
  codigo text unique not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  tipo_premio public.tipo_premio not null,
  valor_descuento numeric(5,2) not null default 0,
  usado_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.citas (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  silla_id uuid references public.sillas on delete set null,
  barbero_id uuid not null references public.barberos on delete cascade,
  cliente_id uuid references public.clientes on delete set null, -- null = walk-in anónimo
  servicio_id uuid references public.servicios_cortes on delete set null,
  tipo text not null default 'ONLINE' check (tipo in ('ONLINE','WALKIN')),
  nombre_walkin text,
  fecha_hora timestamptz not null,
  fecha_fin timestamptz not null,
  estado public.estado_cita not null,
  precio numeric(10,2) not null default 0,
  metodo_pago public.metodo_pago,
  comprobante_pago_url text,   -- ruta en el bucket privado "comprobantes"
  verificado_pago boolean not null default false,
  voucher_id uuid references public.gamificacion_vouchers on delete set null,
  foto_corte_url text,
  notas text check (char_length(notas) <= 300),
  created_at timestamptz not null default now(),
  check (fecha_fin > fecha_hora),
  -- Doble reserva imposible a nivel de BD, no de app: dos citas online vivas
  -- del mismo barbero no pueden solaparse en el tiempo.
  constraint citas_sin_solape exclude using gist (
    barbero_id with =, tstzrange(fecha_hora, fecha_fin) with &&
  ) where (tipo = 'ONLINE' and estado in ('PENDIENTE_PAGO','CONFIRMADA','EN_CURSO'))
);
create index if not exists citas_barberia_fecha on public.citas (barberia_id, fecha_hora);
create index if not exists citas_cliente on public.citas (cliente_id);

create table if not exists public.transacciones_pagos (
  id uuid primary key default gen_random_uuid(),
  cita_id uuid unique references public.citas on delete set null,
  barberia_id uuid not null references public.barberias on delete cascade,
  barbero_id uuid references public.barberos on delete set null,
  monto numeric(10,2) not null check (monto >= 0),
  metodo_pago public.metodo_pago not null,
  destino_pago public.destino_pago not null,
  comision_barbero numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Mensualidad de silla (modo INDIVIDUAL).
create table if not exists public.alquileres (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  barbero_id uuid not null references public.barberos on delete cascade,
  mes date not null,
  monto numeric(10,2) not null,
  pagado_at timestamptz not null default now(),
  unique (barbero_id, mes)
);

create table if not exists public.gamificacion_progreso (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes on delete cascade,
  barberia_id uuid not null references public.barberias on delete cascade,
  barbero_id uuid references public.barberos on delete cascade, -- null = ámbito GLOBAL
  total_cortes_acumulados int not null default 0,
  unique nulls not distinct (cliente_id, barberia_id, barbero_id)
);

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 80),
  descripcion text,
  categoria text,
  precio numeric(10,2) not null check (precio >= 0),
  stock int not null default 0 check (stock >= 0),
  imagen_url text,
  activo boolean not null default true
);

-- ─── Helpers de identidad ──────────────────────────────────────────────────

create or replace function public.es_dueno(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.barberias where id = b and owner_id = auth.uid())
$$;

create or replace function public.mi_barbero() returns public.barberos
language sql stable security definer set search_path = '' as $$
  select * from public.barberos where usuario_id = auth.uid() and activo
$$;

create or replace function public.es_staff(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_dueno(b)
      or exists (select 1 from public.barberos where barberia_id = b and usuario_id = auth.uid() and activo)
$$;

create or replace function public.mi_cliente() returns public.clientes
language sql stable security definer set search_path = '' as $$
  select * from public.clientes where usuario_id = auth.uid()
$$;

create or replace function public.barberia_activa(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.barberias where id = b
    and (plan = 'ACTIVO' or (plan = 'TRIAL' and trial_ends_at > now())))
$$;

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.barberias            enable row level security;
alter table public.pisos                enable row level security;
alter table public.barberos             enable row level security;
alter table public.sillas               enable row level security;
alter table public.clientes             enable row level security;
alter table public.servicios_cortes     enable row level security;
alter table public.barbero_servicios    enable row level security;
alter table public.gamificacion_premios enable row level security;
alter table public.gamificacion_vouchers enable row level security;
alter table public.gamificacion_progreso enable row level security;
alter table public.citas                enable row level security;
alter table public.transacciones_pagos  enable row level security;
alter table public.alquileres           enable row level security;
alter table public.productos            enable row level security;

-- Catálogo público (lo ve cualquiera, lo edita el dueño).
do $$
declare t text;
begin
  foreach t in array array['pisos','sillas','servicios_cortes','gamificacion_premios','productos'] loop
    execute format('drop policy if exists lectura_publica on public.%I', t);
    execute format('create policy lectura_publica on public.%I for select using (true)', t);
    execute format('drop policy if exists dueno_escribe on public.%I', t);
    execute format('create policy dueno_escribe on public.%I for all to authenticated using (public.es_dueno(barberia_id)) with check (public.es_dueno(barberia_id))', t);
  end loop;
end $$;

drop policy if exists lectura_publica on public.barberias;
create policy lectura_publica on public.barberias for select using (true);
drop policy if exists dueno_actualiza on public.barberias;
create policy dueno_actualiza on public.barberias for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- El dueño NO puede tocar plan, trial, código ni dueño: privilegios por columna.
revoke insert, update, delete on public.barberias from anon, authenticated;
grant update (nombre, email_contacto, telefono, whatsapp, descripcion, direccion, referencia, distrito, ciudad,
  lat, lng, horario, fotos, modo_financiero, modo_gamificacion, comision_pct, alquiler_mensual,
  yape_numero, plin_numero, titular_pago, qr_pago_url) on public.barberias to authenticated;

drop policy if exists lectura_publica on public.barberos;
create policy lectura_publica on public.barberos for select using (activo or public.es_staff(barberia_id));
drop policy if exists dueno_actualiza on public.barberos;
create policy dueno_actualiza on public.barberos for update to authenticated
  using (public.es_dueno(barberia_id)) with check (public.es_dueno(barberia_id));
-- Alta/baja de barberos solo por la Pages Function (service role): crea la cuenta.
revoke insert, update, delete on public.barberos from anon, authenticated;
grant update (nombre, avatar_url, bio, comision_pct, yape_numero, plin_numero, activo, horario_atencion,
  especialidades_bestseller) on public.barberos to authenticated;

drop policy if exists lectura_publica on public.barbero_servicios;
create policy lectura_publica on public.barbero_servicios for select using (true);
drop policy if exists staff_escribe on public.barbero_servicios;
create policy staff_escribe on public.barbero_servicios for all to authenticated
  using (exists (select 1 from public.barberos b where b.id = barbero_id
                 and (b.usuario_id = auth.uid() or public.es_dueno(b.barberia_id))))
  with check (exists (select 1 from public.barberos b join public.servicios_cortes s on s.barberia_id = b.barberia_id
                      where b.id = barbero_id and s.id = servicio_id
                        and (b.usuario_id = auth.uid() or public.es_dueno(b.barberia_id))));

drop policy if exists propio on public.clientes;
create policy propio on public.clientes for select to authenticated using (usuario_id = auth.uid());
drop policy if exists staff_ve on public.clientes;
create policy staff_ve on public.clientes for select to authenticated using (
  exists (select 1 from public.citas c where c.cliente_id = clientes.id and public.es_staff(c.barberia_id)));
revoke insert, update, delete on public.clientes from anon, authenticated;
grant update (nombre, telefono) on public.clientes to authenticated;
drop policy if exists propio_actualiza on public.clientes;
create policy propio_actualiza on public.clientes for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists ve_citas on public.citas;
create policy ve_citas on public.citas for select to authenticated using (
  public.es_staff(barberia_id) or cliente_id = (public.mi_cliente()).id);
revoke insert, update, delete on public.citas from anon, authenticated;

drop policy if exists staff_ve on public.transacciones_pagos;
create policy staff_ve on public.transacciones_pagos for select to authenticated using (
  public.es_dueno(barberia_id) or barbero_id = (public.mi_barbero()).id);
revoke insert, update, delete on public.transacciones_pagos from anon, authenticated;

drop policy if exists ve on public.alquileres;
create policy ve on public.alquileres for select to authenticated using (
  public.es_dueno(barberia_id) or barbero_id = (public.mi_barbero()).id);
drop policy if exists dueno_escribe on public.alquileres;
create policy dueno_escribe on public.alquileres for all to authenticated
  using (public.es_dueno(barberia_id)) with check (public.es_dueno(barberia_id));

drop policy if exists ve on public.gamificacion_progreso;
create policy ve on public.gamificacion_progreso for select to authenticated using (
  cliente_id = (public.mi_cliente()).id or public.es_staff(barberia_id));
revoke insert, update, delete on public.gamificacion_progreso from anon, authenticated;

drop policy if exists ve on public.gamificacion_vouchers;
create policy ve on public.gamificacion_vouchers for select to authenticated using (
  cliente_id = (public.mi_cliente()).id or public.es_staff(barberia_id));
revoke insert, update, delete on public.gamificacion_vouchers from anon, authenticated;

-- ─── Triggers ──────────────────────────────────────────────────────────────

-- Cola visible en 3D: walk-ins en fila + citas confirmadas de hoy aún no empezadas.
-- ponytail: "hoy" se evalúa al cambiar una cita; tras medianoche se corrige con
-- el siguiente cambio. Si molesta, un pg_cron diario que recalcule.
create or replace function public.recalcular_cola() returns trigger
language plpgsql security definer set search_path = '' as $$
declare b uuid := coalesce(new.barbero_id, old.barbero_id);
begin
  update public.barberos set cola = (
    select count(*) from public.citas c
    where c.barbero_id = b
      and (c.estado = 'EN_COLA'
        or (c.estado in ('CONFIRMADA','PENDIENTE_PAGO')
            and (c.fecha_hora at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date))
  ) where id = b;
  return null;
end $$;
drop trigger if exists citas_cola on public.citas;
create trigger citas_cola after insert or update of estado or delete on public.citas
  for each row execute function public.recalcular_cola();

-- Lealtad: al completar una cita con cliente, suma el corte y emite voucher al
-- llegar a la meta. Ámbito GLOBAL → contador por barbería; POR_BARBERO → por barbero.
create or replace function public.sumar_corte() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  modo public.modo_gamificacion;
  b uuid;
  total int;
  p public.gamificacion_premios;
begin
  if new.estado <> 'COMPLETADA' or old.estado = 'COMPLETADA' or new.cliente_id is null then
    return new;
  end if;
  select modo_gamificacion into modo from public.barberias where id = new.barberia_id;
  b := case when modo = 'POR_BARBERO' then new.barbero_id end;

  insert into public.gamificacion_progreso (cliente_id, barberia_id, barbero_id, total_cortes_acumulados)
  values (new.cliente_id, new.barberia_id, b, 1)
  on conflict (cliente_id, barberia_id, barbero_id)
  do update set total_cortes_acumulados = public.gamificacion_progreso.total_cortes_acumulados + 1
  returning total_cortes_acumulados into total;

  -- Premio propio del barbero gana al general de la barbería.
  select * into p from public.gamificacion_premios
   where barberia_id = new.barberia_id and activo
     and (barbero_id is null or barbero_id = b)
   order by barbero_id nulls last limit 1;

  if p.id is not null and total % p.meta_cortes = 0 then
    insert into public.gamificacion_vouchers (cliente_id, barberia_id, barbero_id, premio_id, tipo_premio, valor_descuento)
    values (new.cliente_id, new.barberia_id, b, p.id, p.tipo_premio,
            case when p.tipo_premio = 'GRATIS' then 100 else p.valor_descuento end);
  end if;
  return new;
end $$;
drop trigger if exists citas_lealtad on public.citas;
create trigger citas_lealtad after update of estado on public.citas
  for each row execute function public.sumar_corte();

-- ─── RPC: clientes ─────────────────────────────────────────────────────────

create or replace function public.registrar_cliente(p_dni text, p_nombre text, p_telefono text default null)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare c public.clientes;
begin
  if auth.uid() is null then raise exception 'Inicia sesión con Google primero'; end if;
  if p_dni !~ '^[0-9]{8}$' then raise exception 'El DNI debe tener 8 dígitos'; end if;
  if exists (select 1 from public.clientes where dni = p_dni and usuario_id <> auth.uid()) then
    raise exception 'Ese DNI ya está registrado con otra cuenta. Acércate al local para validarlo.';
  end if;
  insert into public.clientes (usuario_id, dni, nombre, email, telefono)
  values (auth.uid(), p_dni, left(p_nombre, 60), auth.jwt() ->> 'email', nullif(p_telefono, ''))
  on conflict (usuario_id) do update
    set nombre = excluded.nombre, telefono = excluded.telefono,
        -- Cambiar el DNI quita la verificación: no se hereda confianza ajena.
        estado_verificacion = case when public.clientes.dni = excluded.dni
                                   then public.clientes.estado_verificacion else 'UNVERIFIED' end,
        dni = excluded.dni
  returning * into c;
  return c;
end $$;

-- Bloques ocupados de un barbero (sin datos personales): lo usa el selector de horas.
create or replace function public.horarios_ocupados(p_barbero uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (inicio timestamptz, fin timestamptz)
language sql stable security definer set search_path = '' as $$
  select fecha_hora, fecha_fin from public.citas
  where barbero_id = p_barbero and tipo = 'ONLINE'
    and estado in ('PENDIENTE_PAGO','CONFIRMADA','EN_CURSO')
    and fecha_hora < p_hasta and fecha_fin > p_desde
    and p_hasta - p_desde <= interval '15 days'
$$;

create or replace function public.reservar_cita(
  p_barbero uuid, p_servicio uuid, p_inicio timestamptz,
  p_comprobante text default null, p_metodo public.metodo_pago default null, p_voucher uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes := public.mi_cliente();
  br public.barberos;
  s public.servicios_cortes;
  v public.gamificacion_vouchers;
  local_ini timestamp := p_inicio at time zone 'America/Lima';
  franja jsonb;
  v_precio numeric;
  nueva uuid;
begin
  if c.id is null then raise exception 'Completa tu registro con DNI antes de reservar'; end if;
  select * into br from public.barberos where id = p_barbero and activo;
  if br.id is null then raise exception 'Barbero no disponible'; end if;
  if not public.barberia_activa(br.barberia_id) then raise exception 'Esta barbería no acepta reservas por ahora'; end if;
  select * into s from public.servicios_cortes where id = p_servicio and barberia_id = br.barberia_id and activo;
  if s.id is null then raise exception 'Servicio no válido'; end if;
  if p_inicio < now() + interval '10 minutes' then raise exception 'Elige una hora con al menos 10 minutos de anticipación'; end if;
  if p_inicio > now() + interval '30 days' then raise exception 'Solo se reserva con hasta 30 días de anticipación'; end if;

  franja := br.horario_atencion -> extract(isodow from local_ini)::text;
  if franja is null or jsonb_typeof(franja) <> 'array'
     or local_ini::time < (franja ->> 0)::time
     or (local_ini + make_interval(mins => s.duracion_min))::time > (franja ->> 1)::time then
    raise exception 'Fuera del horario de atención del barbero';
  end if;

  -- Antitroll: sin verificar, siempre con comprobante; y nadie acapara agenda.
  if c.estado_verificacion = 'UNVERIFIED' and (p_comprobante is null or p_metodo is null) then
    raise exception 'Adjunta tu comprobante de Yape/Plin para reservar';
  end if;
  if p_comprobante is not null and split_part(p_comprobante, '/', 2) <> auth.uid()::text then
    raise exception 'Comprobante inválido';
  end if;
  if (select count(*) from public.citas where cliente_id = c.id and fecha_hora > now()
      and estado in ('PENDIENTE_PAGO','CONFIRMADA')) >= 2 then
    raise exception 'Ya tienes 2 citas pendientes. Cancela una para reservar otra.';
  end if;

  v_precio := s.precio_base;
  if p_voucher is not null then
    select * into v from public.gamificacion_vouchers
     where id = p_voucher and cliente_id = c.id and usado_at is null and barberia_id = br.barberia_id
       and (barbero_id is null or barbero_id = br.id);
    if v.id is null then raise exception 'Voucher no válido'; end if;
    v_precio := round(v_precio * (1 - v.valor_descuento / 100), 2);
    update public.gamificacion_vouchers set usado_at = now() where id = v.id;
  end if;

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, fecha_hora, fecha_fin,
                            estado, precio, metodo_pago, comprobante_pago_url, voucher_id)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, c.id, s.id, 'ONLINE',
          p_inicio, p_inicio + make_interval(mins => s.duracion_min),
          case when c.estado_verificacion = 'VERIFIED_100' and (p_comprobante is null or v_precio = 0)
               then 'CONFIRMADA' else 'PENDIENTE_PAGO' end::public.estado_cita,
          v_precio, p_metodo, p_comprobante, v.id)
  returning id into nueva;
  return nueva;
exception when exclusion_violation then
  raise exception 'Ese horario acaba de ocuparse. Elige otro, por favor.';
end $$;

create or replace function public.cancelar_cita(p_cita uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ci public.citas;
begin
  select * into ci from public.citas where id = p_cita;
  if ci.id is null then raise exception 'Cita no encontrada'; end if;
  if not (public.es_staff(ci.barberia_id)
          or (ci.cliente_id = (public.mi_cliente()).id and ci.fecha_hora > now() + interval '1 hour')) then
    raise exception 'Solo puedes cancelar hasta 1 hora antes';
  end if;
  if ci.estado not in ('PENDIENTE_PAGO','CONFIRMADA','EN_COLA') then raise exception 'La cita ya no se puede cancelar'; end if;
  update public.citas set estado = 'CANCELADA' where id = p_cita;
  update public.gamificacion_vouchers set usado_at = null where id = ci.voucher_id;
end $$;

-- ─── RPC: staff ────────────────────────────────────────────────────────────

-- Aprueba o rechaza el comprobante. Lo revisa quien recibe el dinero:
-- el dueño (CENTRALIZADO) o el barbero de la cita (INDIVIDUAL). El dueño siempre puede.
create or replace function public.revisar_pago(p_cita uuid, p_aprobar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare ci public.citas; modo public.modo_financiero;
begin
  select * into ci from public.citas where id = p_cita for update;
  if ci.id is null or ci.estado <> 'PENDIENTE_PAGO' then raise exception 'La cita no está pendiente de pago'; end if;
  select modo_financiero into modo from public.barberias where id = ci.barberia_id;
  if not (public.es_dueno(ci.barberia_id)
          or (modo = 'INDIVIDUAL' and ci.barbero_id = (public.mi_barbero()).id)) then
    raise exception 'No te corresponde validar este pago';
  end if;

  if not p_aprobar then
    update public.citas set estado = 'RECHAZADA' where id = p_cita;
    update public.gamificacion_vouchers set usado_at = null where id = ci.voucher_id;
    return;
  end if;

  update public.citas set estado = 'CONFIRMADA', verificado_pago = true where id = p_cita;
  update public.clientes set estado_verificacion = 'VERIFIED_100', verificado_at = now()
   where id = ci.cliente_id and estado_verificacion = 'UNVERIFIED';
  insert into public.transacciones_pagos (cita_id, barberia_id, barbero_id, monto, metodo_pago, destino_pago, comision_barbero)
  select ci.id, ci.barberia_id, ci.barbero_id, ci.precio, coalesce(ci.metodo_pago, 'YAPE'),
         case when modo = 'CENTRALIZADO' then 'DUEÑO' else 'BARBERO' end::public.destino_pago,
         case when modo = 'CENTRALIZADO'
              then round(ci.precio * coalesce(b.comision_pct, ba.comision_pct) / 100, 2) else ci.precio end
    from public.barberos b join public.barberias ba on ba.id = b.barberia_id where b.id = ci.barbero_id
  on conflict (cita_id) do nothing;
end $$;

create or replace function public.buscar_cliente_dni(p_dni text)
returns table (id uuid, nombre text, dni text, estado_verificacion public.estado_verificacion)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (public.mi_barbero()).id is null and not exists (select 1 from public.barberias where owner_id = auth.uid()) then
    raise exception 'Solo personal de barbería';
  end if;
  return query select c.id, c.nombre, c.dni, c.estado_verificacion from public.clientes c where c.dni = p_dni;
end $$;

-- Método B: verificación presencial por DNI de un cliente que ya se registró.
create or replace function public.verificar_cliente_dni(p_dni text) returns public.estado_verificacion
language plpgsql security definer set search_path = '' as $$
declare r public.estado_verificacion;
begin
  if (public.mi_barbero()).id is null and not exists (select 1 from public.barberias where owner_id = auth.uid()) then
    raise exception 'Solo personal de barbería';
  end if;
  update public.clientes set estado_verificacion = 'VERIFIED_100', verificado_at = now(),
         registrado_por_barbero_id = (public.mi_barbero()).id
   where dni = p_dni returning estado_verificacion into r;
  if r is null then raise exception 'No hay ningún cliente con ese DNI. Debe registrarse primero con Google.'; end if;
  return r;
end $$;

-- 1-Tap: el barbero cambia su estado. Realtime lo difunde a la vista 3D.
create or replace function public.barbero_set_estado(p_estado public.estado_barbero, p_minutos int default null)
returns public.barberos
language plpgsql security definer set search_path = '' as $$
declare b public.barberos := public.mi_barbero();
begin
  if b.id is null then raise exception 'No eres barbero activo'; end if;
  if b.debe_cambiar_clave then raise exception 'Cambia tu contraseña temporal primero'; end if;
  update public.barberos set estado = p_estado, estado_desde = now(),
         estado_hasta = case when p_estado in ('CORTANDO_CITA','CORTANDO_WALKIN')
                             then now() + make_interval(mins => least(greatest(coalesce(p_minutos, 30), 5), 240)) end
   where id = b.id returning * into b;
  return b;
end $$;

create or replace function public.barbero_actualizar_perfil(
  p_avatar text, p_bio text, p_horario jsonb, p_especialidades jsonb, p_yape text, p_plin text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_horario) <> 'object' or jsonb_typeof(p_especialidades) <> 'array' then
    raise exception 'Formato inválido';
  end if;
  update public.barberos set avatar_url = p_avatar, bio = left(p_bio, 300), horario_atencion = p_horario,
         especialidades_bestseller = p_especialidades, yape_numero = p_yape, plin_numero = p_plin
   where usuario_id = auth.uid();
end $$;

create or replace function public.clave_cambiada() returns void
language sql security definer set search_path = '' as $$
  update public.barberos set debe_cambiar_clave = false where usuario_id = auth.uid()
$$;

-- Walk-in: cliente sin cita entra a la fila del barbero.
create or replace function public.agregar_walkin(p_barbero uuid, p_nombre text, p_dni text default null, p_servicio uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare br public.barberos; s public.servicios_cortes; nueva uuid;
begin
  select * into br from public.barberos where id = p_barbero;
  if br.id is null or not public.es_staff(br.barberia_id) then raise exception 'Sin permiso'; end if;
  select * into s from public.servicios_cortes where id = p_servicio and barberia_id = br.barberia_id;
  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, nombre_walkin,
                            fecha_hora, fecha_fin, estado, precio)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id,
          (select id from public.clientes where dni = p_dni), s.id, 'WALKIN', left(p_nombre, 60),
          now(), now() + make_interval(mins => coalesce(s.duracion_min, 30)), 'EN_COLA', coalesce(s.precio_base, 0))
  returning id into nueva;
  return nueva;
end $$;

-- Inicia una cita/walk-in: la silla pasa a "cortando" con su timer.
create or replace function public.iniciar_cita(p_cita uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ci public.citas; mins int;
begin
  select * into ci from public.citas where id = p_cita for update;
  if ci.id is null or not public.es_staff(ci.barberia_id) then raise exception 'Sin permiso'; end if;
  if ci.estado not in ('CONFIRMADA','EN_COLA') then raise exception 'La cita no se puede iniciar (¿pago pendiente?)'; end if;
  mins := greatest(extract(epoch from ci.fecha_fin - ci.fecha_hora) / 60, 5);
  -- Al empezar se re-ancla al ahora: el timer cuenta desde que el cliente se sienta.
  update public.citas set estado = 'EN_CURSO', fecha_hora = now(), fecha_fin = now() + make_interval(mins => mins)
   where id = p_cita;
  update public.barberos set estado = case when ci.tipo = 'WALKIN' then 'CORTANDO_WALKIN' else 'CORTANDO_CITA' end::public.estado_barbero,
         estado_desde = now(), estado_hasta = now() + make_interval(mins => mins)
   where id = ci.barbero_id;
exception when exclusion_violation then
  raise exception 'Hay otra cita en este momento. Termínala antes de empezar esta.';
end $$;

create or replace function public.completar_cita(p_cita uuid, p_metodo public.metodo_pago, p_monto numeric, p_foto text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare ci public.citas; modo public.modo_financiero; com numeric;
begin
  select * into ci from public.citas where id = p_cita for update;
  if ci.id is null or not public.es_staff(ci.barberia_id) then raise exception 'Sin permiso'; end if;
  if ci.estado not in ('EN_CURSO','CONFIRMADA','EN_COLA') then raise exception 'La cita no está en curso'; end if;
  if p_monto < 0 then raise exception 'Monto inválido'; end if;
  select ba.modo_financiero, coalesce(b.comision_pct, ba.comision_pct) into modo, com
    from public.barberos b join public.barberias ba on ba.id = b.barberia_id where b.id = ci.barbero_id;

  update public.citas set estado = 'COMPLETADA', fecha_fin = greatest(now(), fecha_hora + interval '1 minute'),
         foto_corte_url = coalesce(p_foto, foto_corte_url), metodo_pago = coalesce(metodo_pago, p_metodo)
   where id = p_cita;
  insert into public.transacciones_pagos (cita_id, barberia_id, barbero_id, monto, metodo_pago, destino_pago, comision_barbero)
  values (ci.id, ci.barberia_id, ci.barbero_id, p_monto, p_metodo,
          case when modo = 'CENTRALIZADO' then 'DUEÑO' else 'BARBERO' end::public.destino_pago,
          case when modo = 'CENTRALIZADO' then round(p_monto * com / 100, 2) else p_monto end)
  on conflict (cita_id) do nothing;
  update public.barberos set estado = 'LIBRE', estado_desde = now(), estado_hasta = null
   where id = ci.barbero_id and estado in ('CORTANDO_CITA','CORTANDO_WALKIN');
end $$;

create or replace function public.marcar_no_asistio(p_cita uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ci public.citas;
begin
  select * into ci from public.citas where id = p_cita;
  if ci.id is null or not public.es_staff(ci.barberia_id) then raise exception 'Sin permiso'; end if;
  update public.citas set estado = 'NO_ASISTIO' where id = p_cita and estado in ('CONFIRMADA','EN_COLA','PENDIENTE_PAGO');
end $$;

-- Permisos de ejecución: nada para anon salvo lo público.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.horarios_ocupados(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.es_dueno(uuid), public.es_staff(uuid), public.mi_barbero(), public.mi_cliente(),
  public.barberia_activa(uuid), public.registrar_cliente(text, text, text),
  public.reservar_cita(uuid, uuid, timestamptz, text, public.metodo_pago, uuid), public.cancelar_cita(uuid),
  public.revisar_pago(uuid, boolean), public.buscar_cliente_dni(text), public.verificar_cliente_dni(text),
  public.barbero_set_estado(public.estado_barbero, int),
  public.barbero_actualizar_perfil(text, text, jsonb, jsonb, text, text), public.clave_cambiada(),
  public.agregar_walkin(uuid, text, text, uuid), public.iniciar_cita(uuid),
  public.completar_cita(uuid, public.metodo_pago, numeric, text), public.marcar_no_asistio(uuid)
  to authenticated;
-- Las políticas RLS llaman a estos helpers también para anon.
grant execute on function public.es_staff(uuid), public.es_dueno(uuid) to anon;

-- ─── Realtime ──────────────────────────────────────────────────────────────
-- barberos: estados y cola para la vista 3D pública. citas: avisos al staff (RLS filtra).
do $$ begin
  alter publication supabase_realtime add table public.barberos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.citas;
exception when duplicate_object then null; end $$;

-- ─── Storage ───────────────────────────────────────────────────────────────
-- publico/{barberia_id}/…            fotos de local, avatares, productos, cortes
-- comprobantes/{barberia_id}/{uid}/… capturas de Yape/Plin (privado)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('publico', 'publico', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('comprobantes', 'comprobantes', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.carpeta_uuid(nombre text, n int) returns uuid
language sql immutable set search_path = '' as $$
  select case when (storage.foldername(nombre))[n] ~ '^[0-9a-f-]{36}$'
              then (storage.foldername(nombre))[n]::uuid end
$$;
grant execute on function public.carpeta_uuid(text, int) to anon, authenticated;

drop policy if exists publico_staff_sube on storage.objects;
create policy publico_staff_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'publico' and public.es_staff(public.carpeta_uuid(name, 1)));
drop policy if exists publico_staff_borra on storage.objects;
create policy publico_staff_borra on storage.objects for delete to authenticated
  using (bucket_id = 'publico' and public.es_staff(public.carpeta_uuid(name, 1)));

drop policy if exists comprobante_sube on storage.objects;
create policy comprobante_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and public.carpeta_uuid(name, 2) = auth.uid());
drop policy if exists comprobante_ve on storage.objects;
create policy comprobante_ve on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
         and (public.carpeta_uuid(name, 2) = auth.uid() or public.es_staff(public.carpeta_uuid(name, 1))));
