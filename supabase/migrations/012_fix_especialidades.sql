-- Corrige el guardado del perfil del barbero: especialidades es jsonb y el parámetro llega como text[].
create or replace function public.barbero_actualizar_perfil(
  p_avatar text default null, p_bio text default '', p_horario jsonb default '{}'::jsonb,
  p_especialidades text[] default '{}', p_yape text default null, p_plin text default null,
  p_email_real text default null, p_telefono_real text default null, p_whatsapp text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(p_horario) <> 'object' then
    raise exception 'El horario no tiene el formato correcto. Vuelve a marcar los días de atención.';
  end if;
  if coalesce(array_length(p_especialidades, 1), 0) > 8 then
    raise exception 'Máximo 8 especialidades. Quita algunas y guarda de nuevo.';
  end if;
  update public.barberos set
    avatar_url = p_avatar,
    bio = left(p_bio, 300),
    horario_atencion = p_horario,
    especialidades_bestseller = to_jsonb(coalesce(p_especialidades, '{}'::text[])),
    yape_numero = p_yape,
    plin_numero = p_plin,
    email_real = p_email_real,
    telefono_real = p_telefono_real,
    whatsapp = p_whatsapp
  where usuario_id = auth.uid();
end $$;
