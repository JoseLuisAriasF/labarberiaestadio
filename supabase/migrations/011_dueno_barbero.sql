-- El dueño puede activar su propio perfil de barbero: sigue siendo admin, y además atiende.
create or replace function public.activar_perfil_barbero_dueno(p_nombre text) returns public.barberos
language plpgsql security definer set search_path = '' as $$
declare bar public.barberias; nuevo public.barberos;
begin
  select * into bar from public.barberias where owner_id = auth.uid();
  if bar.id is null then raise exception 'Solo el dueño puede activar este perfil'; end if;
  select * into nuevo from public.barberos where usuario_id = auth.uid();
  if nuevo.id is not null then return nuevo; end if;

  insert into public.barberos (usuario_id, barberia_id, usuario, nombre, horario_atencion)
  values (auth.uid(), bar.id, 'dueno' || substr(md5(random()::text), 1, 8),
          left(coalesce(nullif(trim(p_nombre), ''), 'Dueño'), 60),
          '{"1":["09:00","20:00"],"2":["09:00","20:00"],"3":["09:00","20:00"],"4":["09:00","20:00"],"5":["09:00","20:00"],"6":["09:00","20:00"],"7":null}')
  returning * into nuevo;
  return nuevo;
end $$;
grant execute on function public.activar_perfil_barbero_dueno(text) to authenticated;
