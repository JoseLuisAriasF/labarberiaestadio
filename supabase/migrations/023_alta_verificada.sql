-- El cliente registrado por el staff en el local vino en persona: queda verificado al 100% desde el alta.
create or replace function public.barbero_registrar_cliente(p_dni text, p_tipo text, p_nombre text, p_telefono text default null)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos := public.mi_barbero();
  c public.clientes;
  v_dni text := trim(coalesce(p_dni, ''));
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
  v_nom text := left(trim(coalesce(p_nombre, '')), 60);
begin
  if br.id is null and not exists (select 1 from public.barberias where owner_id = auth.uid()) then
    raise exception 'Sin permiso';
  end if;
  if p_tipo not in ('DNI', 'CE', 'PASAPORTE') then raise exception 'Tipo de documento no válido'; end if;
  if char_length(v_nom) < 2 then raise exception 'Escribe el nombre del cliente'; end if;
  if v_tel is not null and v_tel !~ '^\+?[0-9 ]{6,15}$' then raise exception 'El celular no es válido (6 a 15 números)'; end if;

  select * into c from public.clientes where dni = v_dni;
  if c.id is not null then return c; end if;

  insert into public.clientes (usuario_id, dni, documento_tipo, nombre, telefono, registrado_por_barbero_id, estado_verificacion, verificado_at)
  values (null, v_dni, p_tipo, v_nom, v_tel, br.id, 'VERIFIED_100', now())
  returning * into c;
  return c;
end $$;
grant execute on function public.barbero_registrar_cliente(text, text, text, text) to authenticated;
