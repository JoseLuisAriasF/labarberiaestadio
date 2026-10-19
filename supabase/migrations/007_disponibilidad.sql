-- Disponibilidad pública de los barberos: ocupado/libre, hasta cuándo y cuánta cola hay.
-- No expone datos personales: solo cuenta la cola y suma sus minutos.
create or replace function public.disponibilidad_barberos(p_barberia uuid)
returns table (barbero_id uuid, estado public.estado_barbero, estado_hasta timestamptz, en_cola int, minutos_cola int)
language sql stable security definer set search_path = '' as $$
  select b.id, b.estado, b.estado_hasta,
         count(c.id)::int,
         coalesce(sum(extract(epoch from (c.fecha_fin - c.fecha_hora)) / 60), 0)::int
  from public.barberos b
  left join public.citas c on c.barbero_id = b.id and c.estado = 'EN_COLA' and c.tipo = 'WALKIN'
  where b.barberia_id = p_barberia and b.activo
  group by b.id, b.estado, b.estado_hasta
$$;
grant execute on function public.disponibilidad_barberos(uuid) to anon, authenticated;
