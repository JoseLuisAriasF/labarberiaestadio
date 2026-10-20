-- Cliente con solo celular (sin DNI): login por celular+clave y reserva sin cuenta.
-- El DNI deja de ser obligatorio en clientes; se mantiene unique si llega.

alter table public.clientes alter column dni drop not null;
alter table public.clientes drop constraint if exists clientes_dni_check;
alter table public.clientes add constraint clientes_dni_check
  check (dni is null or dni ~ '^[0-9]{8}$');

-- Celular que el barbero usa para contactar al cliente que reservó sin cuenta.
alter table public.citas add column if not exists telefono_walkin text
  check (telefono_walkin is null or telefono_walkin ~ '^\+?[0-9 ]{6,15}$');

-- Alta de cliente que entró con celular+clave (sin DNI). El email llega después, desde /perfil.
create or replace function public.registrar_cliente_celular(p_nombre text, p_telefono text)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_nom text := left(trim(coalesce(p_nombre, '')), 60);
  v_tel text := trim(coalesce(p_telefono, ''));
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if char_length(v_nom) < 2 then raise exception 'Escribe tu nombre'; end if;
  if v_tel !~ '^\+?[0-9 ]{6,15}$' then raise exception 'El celular no es válido'; end if;

  insert into public.clientes (usuario_id, nombre, telefono, email)
  values (auth.uid(), v_nom, v_tel, nullif(auth.jwt() ->> 'email', ''))
  on conflict (usuario_id) do update
    set nombre = excluded.nombre,
        telefono = coalesce(excluded.telefono, public.clientes.telefono),
        email = coalesce(public.clientes.email, excluded.email)
  returning * into c;
  return c;
end $$;
grant execute on function public.registrar_cliente_celular(text, text) to authenticated;

-- El cliente puede añadir/actualizar su email después (notificaciones).
create or replace function public.cliente_actualizar_email(p_email text) returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare c public.clientes;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  update public.clientes set email = p_email where usuario_id = auth.uid() returning * into c;
  if c.id is null then raise exception 'Primero completa tu registro'; end if;
  return c;
end $$;
grant execute on function public.cliente_actualizar_email(text) to authenticated;

-- Reserva sin crear cuenta: nombre + celular. Modo 1 (comprobante Yape/Plin) o modo 2 (al llegar).
-- Callable sin auth: validación estricta aquí.
create or replace function public.reservar_cita_sin_cuenta(
  p_barbero uuid, p_servicio uuid, p_inicio timestamptz,
  p_nombre text, p_telefono text,
  p_comprobante text default null, p_metodo public.metodo_pago default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos;
  s public.servicios_cortes;
  local_ini timestamp := p_inicio at time zone 'America/Lima';
  franja jsonb;
  nom text := left(trim(coalesce(p_nombre, '')), 60);
  tel text := trim(coalesce(p_telefono, ''));
  nueva uuid;
begin
  if char_length(nom) < 2 then raise exception 'Escribe tu nombre para que el barbero te reconozca'; end if;
  if tel !~ '^\+?[0-9 ]{6,15}$' then raise exception 'El celular no es válido (6 a 15 números)'; end if;

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

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo,
                            nombre_walkin, telefono_walkin,
                            fecha_hora, fecha_fin, estado, precio, metodo_pago, comprobante_pago_url)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, null, s.id, 'ONLINE',
          nom, tel,
          p_inicio, p_inicio + make_interval(mins => s.duracion_min),
          'PENDIENTE_PAGO', s.precio_base, p_metodo, p_comprobante)
  returning id into nueva;
  return nueva;
exception when exclusion_violation then
  raise exception 'Ese horario acaba de ocuparse. Elige otro, por favor.';
end $$;
-- Clave: anon puede ejecutar (es reserva sin cuenta).
grant execute on function public.reservar_cita_sin_cuenta(uuid, uuid, timestamptz, text, text, text, public.metodo_pago) to anon, authenticated;
