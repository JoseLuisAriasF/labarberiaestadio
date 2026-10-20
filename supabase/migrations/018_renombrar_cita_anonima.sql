-- El staff corrige el nombre de un cliente sin cuenta (walk-in o reserva anónima).
-- Los clientes con cuenta cambian su nombre ellos mismos: aquí no se tocan.
create or replace function public.barbero_renombrar_cita(p_cita uuid, p_nombre text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ci public.citas;
  nom text := left(trim(coalesce(p_nombre, '')), 60);
begin
  select * into ci from public.citas where id = p_cita;
  if ci.id is null then raise exception 'Cita no encontrada'; end if;
  if not public.es_staff(ci.barberia_id) then raise exception 'Sin permiso'; end if;
  if ci.cliente_id is not null then raise exception 'Este cliente tiene cuenta: su nombre lo cambia él desde su perfil'; end if;
  if char_length(nom) < 2 then raise exception 'Escribe al menos 2 letras'; end if;
  update public.citas set nombre_walkin = nom where id = p_cita;
end $$;
grant execute on function public.barbero_renombrar_cita(uuid, text) to authenticated;
