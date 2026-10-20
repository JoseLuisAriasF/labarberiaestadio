-- Celular único en clientes (como el DNI): no se puede repetir. Nulls permitidos.
create unique index if not exists clientes_telefono_unico on public.clientes (telefono) where telefono is not null;

-- Mensaje claro cuando el celular (o DNI) ya está en otra ficha.
-- Reemplaza registrar_cliente_celular con detección de duplicado antes del insert.
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

  if exists (select 1 from public.clientes where telefono = v_tel and usuario_id <> auth.uid()) then
    raise exception 'Ese celular ya está registrado en otra cuenta. Si es tuyo, pide al administrador que lo libere.';
  end if;

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

-- Mismo check en registrar_cliente (flujo con DNI) para que el celular tampoco se duplique.
create or replace function public.registrar_cliente(p_dni text, p_nombre text, p_telefono text default null)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
begin
  if p_dni !~ '^[0-9]{8}$' then raise exception 'El DNI debe tener 8 dígitos'; end if;
  if exists (select 1 from public.clientes where dni = p_dni and usuario_id <> auth.uid()) then
    raise exception 'Ese DNI ya está registrado en otra cuenta. Si es tuyo, pide al administrador que lo libere.';
  end if;
  if v_tel is not null and exists (select 1 from public.clientes where telefono = v_tel and usuario_id <> auth.uid()) then
    raise exception 'Ese celular ya está registrado en otra cuenta. Si es tuyo, pide al administrador que lo libere.';
  end if;
  insert into public.clientes (usuario_id, dni, nombre, email, telefono)
  values (auth.uid(), p_dni, left(p_nombre, 60), auth.jwt() ->> 'email', v_tel)
  on conflict (usuario_id) do update
    set nombre = excluded.nombre, telefono = excluded.telefono,
        email = coalesce(public.clientes.email, excluded.email),
        estado_verificacion = case when public.clientes.dni = excluded.dni
                                   then public.clientes.estado_verificacion else 'UNVERIFIED' end,
        dni = excluded.dni
  returning * into c;
  return c;
end $$;
grant execute on function public.registrar_cliente(text, text, text) to authenticated;

-- El admin/dueño puede corregir dni y celular de un cliente en caso de conflicto.
create or replace function public.admin_actualizar_cliente(p_cliente uuid, p_dni text default null, p_telefono text default null)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_dni text := nullif(trim(coalesce(p_dni, '')), '');
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  select * into c from public.clientes where id = p_cliente;
  if c.id is null then raise exception 'Cliente no encontrado'; end if;
  if not exists (select 1 from public.citas ci where ci.cliente_id = c.id and public.es_staff(ci.barberia_id))
     and not exists (select 1 from public.barberias where owner_id = auth.uid()) then
    raise exception 'Sin permiso';
  end if;
  if v_dni is not null then
    if v_dni !~ '^[0-9]{8}$' then raise exception 'El DNI debe tener 8 dígitos'; end if;
    if exists (select 1 from public.clientes where dni = v_dni and id <> p_cliente) then
      raise exception 'Ese DNI ya está en otra ficha';
    end if;
  end if;
  if v_tel is not null then
    if v_tel !~ '^\+?[0-9 ]{6,15}$' then raise exception 'El celular no es válido'; end if;
    if exists (select 1 from public.clientes where telefono = v_tel and id <> p_cliente) then
      raise exception 'Ese celular ya está en otra ficha';
    end if;
  end if;
  update public.clientes
     set dni = coalesce(v_dni, dni),
         telefono = coalesce(v_tel, telefono)
   where id = p_cliente
   returning * into c;
  return c;
end $$;
grant execute on function public.admin_actualizar_cliente(uuid, text, text) to authenticated;
