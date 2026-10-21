-- Ficha de cliente automática al entrar (sin DNI). Se completa después desde el perfil.
create or replace function public.registrar_cliente_auto(p_nombre text) returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_nom text := left(coalesce(nullif(trim(p_nombre), ''), 'Cliente'), 60);
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  insert into public.clientes (usuario_id, nombre, email)
  values (auth.uid(), v_nom, nullif(auth.jwt() ->> 'email', ''))
  on conflict (usuario_id) do update set email = coalesce(public.clientes.email, excluded.email)
  returning * into c;
  return c;
end $$;
grant execute on function public.registrar_cliente_auto(text) to authenticated;
