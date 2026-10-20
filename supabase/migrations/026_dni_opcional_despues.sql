-- El DNI es opcional: el cliente lo añade después desde su perfil.
create or replace function public.cliente_completar_dni(p_dni text) returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare c public.clientes;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if p_dni !~ '^[0-9]{8}$' then raise exception 'El DNI debe tener 8 dígitos'; end if;
  if exists (select 1 from public.clientes where dni = p_dni and usuario_id <> auth.uid()) then
    raise exception 'Ese DNI ya está registrado en otra cuenta. Si es tuyo, pide al administrador que lo libere.';
  end if;
  update public.clientes set dni = p_dni where usuario_id = auth.uid() returning * into c;
  if c.id is null then raise exception 'Primero crea tu cuenta'; end if;
  return c;
end $$;
grant execute on function public.cliente_completar_dni(text) to authenticated;
