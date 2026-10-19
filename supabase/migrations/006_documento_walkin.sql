-- Documento como identidad del cliente: DNI, carné de extranjería o pasaporte.
-- Un cliente sin cuenta (walk-in) también tiene fila, con usuario_id nulo, y suma su cartilla.
alter table public.clientes alter column usuario_id drop not null;

alter table public.clientes add column if not exists documento_tipo text not null default 'DNI'
  check (documento_tipo in ('DNI', 'CE', 'PASAPORTE'));

alter table public.clientes drop constraint if exists clientes_dni_check;
alter table public.clientes add constraint clientes_dni_check check (
  (documento_tipo = 'DNI' and dni ~ '^[0-9]{8}$')
  or (documento_tipo in ('CE', 'PASAPORTE') and dni ~ '^[A-Za-z0-9]{6,20}$'));

drop function if exists public.agregar_walkin(uuid, text, text, uuid);
create or replace function public.agregar_walkin(
  p_barbero uuid, p_nombre text, p_dni text, p_servicio uuid default null, p_tipo text default 'DNI')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare br public.barberos; s public.servicios_cortes; cli public.clientes; nueva uuid;
begin
  select * into br from public.barberos where id = p_barbero;
  if br.id is null or not public.es_staff(br.barberia_id) then raise exception 'Sin permiso'; end if;
  if coalesce(p_dni, '') = '' then raise exception 'El documento es obligatorio para sumar cortes'; end if;
  select * into s from public.servicios_cortes where id = p_servicio and barberia_id = br.barberia_id and activo;
  if s.id is null then raise exception 'Servicio no válido'; end if;

  select * into cli from public.clientes where dni = p_dni;
  if cli.id is null then
    insert into public.clientes (usuario_id, dni, documento_tipo, nombre, registrado_por_barbero_id)
    values (null, p_dni, p_tipo, left(p_nombre, 60), br.id)
    returning * into cli;
  end if;

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, nombre_walkin,
                            fecha_hora, fecha_fin, estado, precio)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, cli.id, s.id, 'WALKIN',
          left(coalesce(cli.nombre, p_nombre), 60),
          now(), now() + make_interval(mins => coalesce(s.duracion_min, 30)), 'EN_COLA', coalesce(s.precio_base, 0))
  returning id into nueva;
  return nueva;
end $$;

-- Un cliente que ya tiene cartilla como walk-in se enlaza a su cuenta de Google al registrarse.
create or replace function public.registrar_cliente(p_dni text, p_nombre text, p_telefono text default null)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare c public.clientes;
begin
  if auth.uid() is null then raise exception 'Inicia sesión con Google primero'; end if;
  if p_dni !~ '^[0-9]{8}$' then raise exception 'El DNI debe tener 8 dígitos'; end if;
  if exists (select 1 from public.clientes where dni = p_dni and usuario_id is not null and usuario_id <> auth.uid()) then
    raise exception 'Ese DNI ya está registrado con otra cuenta. Acércate al local para validarlo.';
  end if;
  update public.clientes set usuario_id = auth.uid(), email = auth.jwt() ->> 'email',
         nombre = coalesce(nombre, left(p_nombre, 60)), telefono = coalesce(nullif(p_telefono, ''), telefono)
   where dni = p_dni and usuario_id is null
  returning * into c;
  if c.id is not null then return c; end if;

  insert into public.clientes (usuario_id, dni, nombre, email, telefono)
  values (auth.uid(), p_dni, left(p_nombre, 60), auth.jwt() ->> 'email', nullif(p_telefono, ''))
  on conflict (usuario_id) do update
    set nombre = excluded.nombre, telefono = excluded.telefono,
        estado_verificacion = case when public.clientes.dni = excluded.dni
                                   then public.clientes.estado_verificacion else 'UNVERIFIED' end,
        dni = excluded.dni
  returning * into c;
  return c;
end $$;
