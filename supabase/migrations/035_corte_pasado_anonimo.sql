-- Corte anónimo que ya se hizo: queda completado, sin cartilla, con nombre opcional y cobro en caja.
create or replace function public.registrar_corte_pasado_anonimo(p_barbero uuid, p_nombre text, p_servicio uuid, p_inicio timestamptz, p_metodo public.metodo_pago)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos;
  s public.servicios_cortes;
  ba public.barberias;
  ci_id uuid;
  com numeric;
  nom text := left(coalesce(nullif(trim(p_nombre), ''), 'Anónimo'), 60);
begin
  select * into br from public.barberos where id = p_barbero;
  if br.id is null or not public.es_staff(br.barberia_id) then raise exception 'Sin permiso'; end if;
  select * into s from public.servicios_cortes where id = p_servicio and barberia_id = br.barberia_id and activo;
  if s.id is null then raise exception 'Servicio no válido'; end if;
  if p_inicio > now() then raise exception 'Solo se registran cortes que ya se hicieron'; end if;
  select * into ba from public.barberias where id = br.barberia_id;
  com := coalesce(br.comision_pct, ba.comision_pct);

  insert into public.citas (barberia_id, silla_id, barbero_id, cliente_id, servicio_id, tipo, nombre_walkin,
                            fecha_hora, fecha_fin, estado, precio, metodo_pago)
  values (br.barberia_id, (select id from public.sillas where barbero_id = br.id), br.id, null, s.id, 'WALKIN', nom,
          p_inicio, p_inicio + make_interval(mins => s.duracion_min), 'EN_COLA', s.precio_base, p_metodo)
  returning id into ci_id;

  update public.citas set estado = 'COMPLETADA', fecha_fin = p_inicio + make_interval(mins => s.duracion_min)
   where id = ci_id;

  insert into public.transacciones_pagos (cita_id, barberia_id, barbero_id, monto, metodo_pago, destino_pago, comision_barbero)
  values (ci_id, br.barberia_id, br.id, s.precio_base, p_metodo,
          case when ba.modo_financiero = 'CENTRALIZADO' then 'DUEÑO' else 'BARBERO' end::public.destino_pago,
          case when ba.modo_financiero = 'CENTRALIZADO' then round(s.precio_base * com / 100, 2) else s.precio_base end);
  return ci_id;
end $$;
grant execute on function public.registrar_corte_pasado_anonimo(uuid, text, uuid, timestamptz, public.metodo_pago) to authenticated;
