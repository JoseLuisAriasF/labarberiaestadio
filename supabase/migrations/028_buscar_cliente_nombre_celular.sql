-- Búsqueda de clientes para el personal por DNI, nombre o celular.
create or replace function public.buscar_clientes_staff(p_q text)
returns table (id uuid, nombre text, dni text, telefono text, estado_verificacion public.estado_verificacion)
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := trim(coalesce(p_q, ''));
  digitos text := regexp_replace(trim(coalesce(p_q, '')), '\D', '', 'g');
begin
  if (public.mi_barbero()).id is null and not exists (select 1 from public.barberias where owner_id = auth.uid()) then
    raise exception 'Solo personal de barbería';
  end if;
  if char_length(q) < 3 then return; end if;
  return query
    select c.id, c.nombre, c.dni, c.telefono, c.estado_verificacion
    from public.clientes c
    where c.dni = q
       or (char_length(digitos) >= 6 and c.telefono is not null
           and regexp_replace(c.telefono, '\D', '', 'g') like '%' || digitos || '%')
       or (c.nombre ilike '%' || q || '%')
    order by (c.dni = q) desc, c.nombre
    limit 8;
end $$;
grant execute on function public.buscar_clientes_staff(text) to authenticated;
