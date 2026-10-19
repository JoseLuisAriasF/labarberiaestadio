-- Cliente nuevo sin adelanto: puede pedir cita sin comprobante. Queda PENDIENTE_PAGO
-- hasta que el barbero la confirme (lo conoce) o la rechace.
create or replace function public.reservar_cita(
  p_barbero uuid, p_servicio uuid, p_inicio timestamptz,
  p_comprobante text default null, p_metodo public.metodo_pago default null, p_voucher uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes := public.mi_cliente();
  br public.barberos;
  s public.servicios_cortes;
  v public.gamificacion_vouchers;
  local_ini timestamp := p_inicio at time zone 'America/Lima';
  franja jsonb;
  v_precio numeric;
  nueva uuid;
begin
  if c.id is null then raise exception 'Completa tu registro con DNI antes de reservar'; end if;
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

  if p_comprobante is not null and split_part(p_comprobante, '/', 2) <> auth.uid()::text then
    raise exception 'Comprobante inválido';
  end if;
  if (select count(*) from public.citas where cliente_id = c.id and fecha_hora > now()
      and estado in ('PENDIENTE_PAGO','CONFIRMADA')) >= 2 then
    raise exception 'Ya tienes 2 citas pendientes. Cancela una para reservar otra.';
  end if;

  v_precio := s.precio_base;
  if p_voucher is not null then
    select * into v from public.gamificacion_vouchers
     where id = p_voucher and cliente_id = c.id and usado_at is null and barberia_id = br.barberia_id
       and (barbero_id is null or barbero_id = br.id);
    if v.id is null then raise exception 'Voucher no válido'; end if;
    v_precio := round(v_precio * (1 - v.valor_descuento / 100), 2);
    update public.gamificacion_vouchers set usado_at = now() where id = v.id;
  end if;

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, fecha_hora, fecha_fin,
                            estado, precio, metodo_pago, comprobante_pago_url, voucher_id)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, c.id, s.id, 'ONLINE',
          p_inicio, p_inicio + make_interval(mins => s.duracion_min),
          case when c.estado_verificacion = 'VERIFIED_100' and (p_comprobante is null or v_precio = 0)
               then 'CONFIRMADA' else 'PENDIENTE_PAGO' end::public.estado_cita,
          v_precio, p_metodo, p_comprobante, v.id)
  returning id into nueva;
  return nueva;
exception when exclusion_violation then
  raise exception 'Ese horario acaba de ocuparse. Elige otro, por favor.';
end $$;

-- El barbero (o el dueño) confirma a un cliente que ya conoce, sin pago anticipado.
create or replace function public.confirmar_cita_conocido(p_cita uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ci public.citas;
begin
  select * into ci from public.citas where id = p_cita for update;
  if ci.id is null or ci.estado <> 'PENDIENTE_PAGO' then raise exception 'La cita no está pendiente'; end if;
  if not (public.es_dueno(ci.barberia_id) or ci.barbero_id = (public.mi_barbero()).id) then
    raise exception 'No te corresponde confirmar esta cita';
  end if;
  update public.citas set estado = 'CONFIRMADA' where id = p_cita;
  update public.clientes set estado_verificacion = 'VERIFIED_100', verificado_at = now(),
         registrado_por_barbero_id = (public.mi_barbero()).id
   where id = ci.cliente_id and estado_verificacion = 'UNVERIFIED';
end $$;
