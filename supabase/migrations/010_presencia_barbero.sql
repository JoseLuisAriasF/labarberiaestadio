-- Check-in de llegada: el barbero solo aparece en su silla del mapa cuando marca que llegó.
alter table public.barberos add column if not exists presente boolean not null default false;

create or replace function public.marcar_presencia(p_barbero uuid, p_presente boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare br public.barberos;
begin
  select * into br from public.barberos where id = p_barbero;
  if br.id is null or not (br.usuario_id = auth.uid() or public.es_dueno(br.barberia_id)) then
    raise exception 'Sin permiso';
  end if;
  update public.barberos
     set presente = p_presente,
         estado = case when p_presente then 'LIBRE'::public.estado_barbero else estado end,
         estado_desde = now(),
         estado_hasta = null
   where id = p_barbero;
end $$;
grant execute on function public.marcar_presencia(uuid, boolean) to authenticated;
