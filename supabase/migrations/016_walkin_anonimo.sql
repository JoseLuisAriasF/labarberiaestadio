-- Corte sin cita y sin registrar: queda en caja y estadísticas, sin cliente ni cartilla.
drop function if exists public.agregar_walkin(uuid, text, text, uuid, text);
create or replace function public.agregar_walkin(
  p_barbero uuid, p_nombre text, p_dni text default null, p_servicio uuid default null, p_tipo text default 'DNI')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos;
  s public.servicios_cortes;
  cli public.clientes;
  nueva uuid;
  nom text := left(coalesce(nullif(trim(p_nombre), ''), 'Anónimo'), 60);
begin
  select * into br from public.barberos where id = p_barbero;
  if br.id is null or not public.es_staff(br.barberia_id) then raise exception 'Sin permiso'; end if;
  select * into s from public.servicios_cortes where id = p_servicio and barberia_id = br.barberia_id and activo;
  if s.id is null then raise exception 'Servicio no válido'; end if;

  if coalesce(trim(p_dni), '') <> '' then
    select * into cli from public.clientes where dni = trim(p_dni);
    if cli.id is null then
      insert into public.clientes (usuario_id, dni, documento_tipo, nombre, registrado_por_barbero_id)
      values (null, trim(p_dni), p_tipo, nom, br.id)
      returning * into cli;
    end if;
  end if;

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, nombre_walkin,
                            fecha_hora, fecha_fin, estado, precio)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, cli.id, s.id, 'WALKIN',
          case when cli.id is null then nom else left(coalesce(cli.nombre, nom), 60) end,
          now(), now() + make_interval(mins => coalesce(s.duracion_min, 30)), 'EN_COLA', coalesce(s.precio_base, 0))
  returning id into nueva;
  return nueva;
end $$;
