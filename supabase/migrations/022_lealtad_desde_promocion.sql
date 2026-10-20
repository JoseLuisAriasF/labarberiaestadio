-- Los cortes solo cuentan mientras haya una promoción de lealtad activa que les aplique.
-- Un corte hecho sin promoción no suma a la cartilla, y tampoco cuenta después cuando se cree la promoción.
create or replace function public.sumar_corte() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  modo public.modo_gamificacion;
  b uuid;
  total int;
  p public.gamificacion_premios;
begin
  if new.estado <> 'COMPLETADA' or old.estado = 'COMPLETADA' or new.cliente_id is null then
    return new;
  end if;
  select modo_gamificacion into modo from public.barberias where id = new.barberia_id;
  b := case when modo = 'POR_BARBERO' then new.barbero_id end;

  -- Premio propio del barbero gana al general de la barbería.
  select * into p from public.gamificacion_premios
   where barberia_id = new.barberia_id and activo
     and (barbero_id is null or barbero_id = b)
   order by barbero_id nulls last limit 1;
  -- Sin promoción activa, el corte no suma.
  if p.id is null then return new; end if;

  insert into public.gamificacion_progreso (cliente_id, barberia_id, barbero_id, total_cortes_acumulados)
  values (new.cliente_id, new.barberia_id, b, 1)
  on conflict (cliente_id, barberia_id, barbero_id)
  do update set total_cortes_acumulados = public.gamificacion_progreso.total_cortes_acumulados + 1
  returning total_cortes_acumulados into total;

  if total % p.meta_cortes = 0 then
    insert into public.gamificacion_vouchers (cliente_id, barberia_id, barbero_id, premio_id, tipo_premio, valor_descuento)
    values (new.cliente_id, new.barberia_id, b, p.id, p.tipo_premio,
            case when p.tipo_premio = 'GRATIS' then 100 else p.valor_descuento end);
  end if;
  return new;
end $$;
