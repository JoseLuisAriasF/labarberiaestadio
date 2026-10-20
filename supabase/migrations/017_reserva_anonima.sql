-- Reserva anónima: el cliente con Google reserva sin registrar su DNI.
-- No se crea fila en clientes (cliente_id nulo); queda el nombre y el comprobante Yape/Plin.
-- El barbero valida el pago en "Citas" como cualquier otra cita pendiente.
create or replace function public.reservar_cita_anonima(
  p_barbero uuid, p_servicio uuid, p_inicio timestamptz, p_nombre text, p_comprobante text, p_metodo public.metodo_pago)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos;
  s public.servicios_cortes;
  local_ini timestamp := p_inicio at time zone 'America/Lima';
  franja jsonb;
  nom text := left(trim(coalesce(p_nombre, '')), 60);
  nueva uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión con Google para reservar'; end if;
  if char_length(nom) < 2 then raise exception 'Escribe tu nombre para que el barbero te reconozca'; end if;
  if p_comprobante is null or split_part(p_comprobante, '/', 2) <> auth.uid()::text then
    raise exception 'Adjunta la captura de tu Yape o Plin';
  end if;

  select * into br from public.barberos where id = p_barbero and activo;
  if br.id is null then raise exception 'Barbero no disponible'; end if;
  if not public.barberia_activa(br.barberia_id) then raise exception 'Esta barbería no acepta reservas por ahora'; end if;
  select * into s from public.servicios_cortes where id = p_servicio and barberia_id = br.barberia_id and activo;
  if s.id is null then raise exception 'Servicio no válido'; end if;
  if p_inicio < now() + interval '10 minutes' then raise exception 'Elige una hora con al menos 10 minutos de anticipación'; end if;
  if p_inicio > now() + interval '30 days' then raise exception 'Solo se reserva con hasta 30 días de anticipación'; end if;

  franja := br.horario_atencion -> extract(isodow from local_ini)::text;
  if franja is null or jsonb_typeof(franja) <> 'array'
     or local_ini::time < (franja ->> 0)::time
     or (local_ini + make_interval(mins => s.duracion_min))::time > (franja ->> 1)::time then
    raise exception 'Fuera del horario de atención del barbero';
  end if;

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, nombre_walkin,
                            fecha_hora, fecha_fin, estado, precio, metodo_pago, comprobante_pago_url)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, null, s.id, 'ONLINE', nom,
          p_inicio, p_inicio + make_interval(mins => s.duracion_min), 'PENDIENTE_PAGO', s.precio_base, p_metodo, p_comprobante)
  returning id into nueva;
  return nueva;
exception when exclusion_violation then
  raise exception 'Ese horario acaba de ocuparse. Elige otro, por favor.';
end $$;
grant execute on function public.reservar_cita_anonima(uuid, uuid, timestamptz, text, text, public.metodo_pago) to authenticated;
