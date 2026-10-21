-- El panel de clientes muestra y busca por celular; la verificación presencial ya no depende del DNI.
drop function if exists public.resumen_clientes(uuid);
create function public.resumen_clientes(p_barberia uuid)
returns table (cliente_id uuid, nombre text, documento text, documento_tipo text, telefono text, cortes bigint, ultima_visita timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_staff(p_barberia) then raise exception 'Solo personal de la barbería'; end if;
  return query
  select c.id, c.nombre, c.dni, c.documento_tipo, c.telefono,
         count(x.id) filter (where x.estado = 'COMPLETADA'), max(x.fecha_hora)
  from public.clientes c
  join public.citas x on x.cliente_id = c.id and x.barberia_id = p_barberia
  group by c.id, c.nombre, c.dni, c.documento_tipo, c.telefono
  order by max(x.fecha_hora) desc;
end $$;
grant execute on function public.resumen_clientes(uuid) to authenticated;

create or replace function public.verificar_cliente_id(p_cliente uuid) returns public.estado_verificacion
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.citas c where c.cliente_id = p_cliente and public.es_staff(c.barberia_id)) then
    raise exception 'Sin permiso: ese cliente no tiene citas en tu barbería';
  end if;
  update public.clientes set estado_verificacion = 'VERIFIED_100' where id = p_cliente;
  return 'VERIFIED_100';
end $$;
grant execute on function public.verificar_cliente_id(uuid) to authenticated;
