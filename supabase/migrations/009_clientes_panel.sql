-- Vista de clientes para el personal: lista y progreso de cada cartilla (solo staff de la barbería).
create or replace function public.resumen_clientes(p_barberia uuid)
returns table (cliente_id uuid, nombre text, documento text, documento_tipo text, cortes bigint, ultima_visita timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_staff(p_barberia) then raise exception 'Solo personal de la barbería'; end if;
  return query
  select c.id, c.nombre, c.dni, c.documento_tipo,
         count(x.id) filter (where x.estado = 'COMPLETADA'), max(x.fecha_hora)
  from public.clientes c
  join public.citas x on x.cliente_id = c.id and x.barberia_id = p_barberia
  group by c.id, c.nombre, c.dni, c.documento_tipo
  order by max(x.fecha_hora) desc;
end $$;

-- Cartillas de un cliente en esta barbería, según el modo (global o por barbero) y su premio activo.
create or replace function public.tarjetas_cliente(p_cliente uuid, p_barberia uuid)
returns table (barbero_id uuid, barbero_nombre text, cortes int, meta int, faltan int, premio text)
language plpgsql stable security definer set search_path = '' as $$
declare modo public.modo_gamificacion;
begin
  if not public.es_staff(p_barberia) then raise exception 'Solo personal de la barbería'; end if;
  select modo_gamificacion into modo from public.barberias where id = p_barberia;
  return query
  select g.barbero_id, b.nombre,
         (g.total_cortes_acumulados % coalesce(p.meta_cortes, 10))::int,
         coalesce(p.meta_cortes, 10)::int,
         (coalesce(p.meta_cortes, 10) - (g.total_cortes_acumulados % coalesce(p.meta_cortes, 10)))::int,
         case when p.id is null then 'Sin premio activo'
              when p.tipo_premio = 'GRATIS' then 'un corte gratis'
              else p.valor_descuento || '% de descuento' end
  from public.gamificacion_progreso g
  left join public.barberos b on b.id = g.barbero_id
  left join lateral (
    select x.* from public.gamificacion_premios x
     where x.barberia_id = g.barberia_id and x.activo and (x.barbero_id = g.barbero_id or x.barbero_id is null)
     order by x.barbero_id nulls last limit 1) p on true
  where g.cliente_id = p_cliente and g.barberia_id = p_barberia
    and ((modo = 'POR_BARBERO') = (g.barbero_id is not null));
end $$;
