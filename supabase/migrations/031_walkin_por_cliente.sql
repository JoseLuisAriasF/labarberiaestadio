-- Corte sin cita para un cliente ya elegido (por celular o DNI): suma a su cartilla.
create or replace function public.agregar_walkin_cliente(p_barbero uuid, p_cliente uuid, p_servicio uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos;
  s public.servicios_cortes;
  cli public.clientes;
  nueva uuid;
begin
  select * into br from public.barberos where id = p_barbero;
  if br.id is null or not public.es_staff(br.barberia_id) then raise exception 'Sin permiso'; end if;
  select * into s from public.servicios_cortes where id = p_servicio and barberia_id = br.barberia_id and activo;
  if s.id is null then raise exception 'Servicio no válido'; end if;
  select * into cli from public.clientes where id = p_cliente;
  if cli.id is null then raise exception 'Cliente no encontrado'; end if;

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, nombre_walkin,
                            fecha_hora, fecha_fin, estado, precio)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, cli.id, s.id, 'WALKIN',
          left(coalesce(cli.nombre, 'Cliente'), 60),
          now(), now() + make_interval(mins => coalesce(s.duracion_min, 30)), 'EN_COLA', coalesce(s.precio_base, 0))
  returning id into nueva;
  return nueva;
end $$;
grant execute on function public.agregar_walkin_cliente(uuid, uuid, uuid) to authenticated;
