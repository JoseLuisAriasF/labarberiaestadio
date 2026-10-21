-- El celular es la identidad principal del cliente.

-- Registro rápido desde la agenda: solo nombre y celular, sin cuenta ni DNI.
create or replace function public.barbero_registrar_cliente_celular(p_nombre text, p_telefono text)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos := public.mi_barbero();
  c public.clientes;
  v_nom text := left(trim(coalesce(p_nombre, '')), 60);
  v_tel text := trim(coalesce(p_telefono, ''));
  digitos text := regexp_replace(trim(coalesce(p_telefono, '')), '\D', '', 'g');
begin
  if br.id is null and not exists (select 1 from public.barberias where owner_id = auth.uid()) then
    raise exception 'Sin permiso';
  end if;
  if char_length(v_nom) < 2 then raise exception 'Escribe el nombre del cliente'; end if;
  if v_tel !~ '^\+?[0-9 ]{6,15}$' then raise exception 'El celular no es válido (6 a 15 números)'; end if;

  select * into c from public.clientes
   where regexp_replace(coalesce(telefono, ''), '\D', '', 'g') = digitos limit 1;
  if c.id is not null then return c; end if;

  insert into public.clientes (usuario_id, nombre, telefono, registrado_por_barbero_id)
  values (null, v_nom, v_tel, br.id)
  returning * into c;
  return c;
end $$;
grant execute on function public.barbero_registrar_cliente_celular(text, text) to authenticated;

-- Cuando el cliente crea su cuenta con su celular, reclama la ficha que el local ya tenía con ese número.
create or replace function public.registrar_cliente_celular(p_nombre text, p_telefono text)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_nom text := left(trim(coalesce(p_nombre, '')), 60);
  v_tel text := trim(coalesce(p_telefono, ''));
  digitos text := regexp_replace(trim(coalesce(p_telefono, '')), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if char_length(v_nom) < 2 then raise exception 'Escribe tu nombre'; end if;
  if v_tel !~ '^\+?[0-9 ]{6,15}$' then raise exception 'El celular no es válido'; end if;

  select * into c from public.clientes
   where regexp_replace(coalesce(telefono, ''), '\D', '', 'g') = digitos and usuario_id is null limit 1;
  if c.id is not null then
    update public.clientes
       set usuario_id = auth.uid(), nombre = v_nom, email = coalesce(email, nullif(auth.jwt() ->> 'email', ''))
     where id = c.id returning * into c;
    return c;
  end if;

  if exists (select 1 from public.clientes
              where regexp_replace(coalesce(telefono, ''), '\D', '', 'g') = digitos and usuario_id <> auth.uid()) then
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
