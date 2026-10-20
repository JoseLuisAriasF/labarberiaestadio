-- Administradores delegados y permisos por módulo.
-- El dueño marca a un barbero de confianza como administrador (acceso a todo) o le da módulos sueltos.
-- La base hace cumplir los permisos: el delegado no puede escribir en un módulo que no le toca.

alter table public.barberos add column if not exists es_admin boolean not null default false;
alter table public.barberos add column if not exists permisos text[] not null default '{}';
alter table public.barberos drop constraint if exists barberos_permisos_check;
alter table public.barberos add constraint barberos_permisos_check check (permisos <@ array[
  'agenda','clientes','finanzas','estadisticas','equipo','servicios','lealtad','productos','pisos','local','festivos']::text[]);

-- Dueño, o barbero activo con el módulo (o administrador delegado).
create or replace function public.puede(b uuid, m text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_dueno(b) or exists (
    select 1 from public.barberos x
     where x.barberia_id = b and x.usuario_id = auth.uid() and x.activo and (x.es_admin or m = any (x.permisos)))
$$;

-- Solo el dueño cambia permisos: ni el propio delegado puede subirse el nivel.
create or replace function public.proteger_permisos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.es_admin is distinct from old.es_admin or new.permisos is distinct from old.permisos)
     and not public.es_dueno(old.barberia_id) then
    raise exception 'Solo el dueño de la barbería asigna permisos';
  end if;
  return new;
end $$;
drop trigger if exists barberos_proteger_permisos on public.barberos;
create trigger barberos_proteger_permisos before update on public.barberos
  for each row execute function public.proteger_permisos();

create or replace function public.barbero_set_permisos(p_barbero uuid, p_es_admin boolean, p_permisos text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.barberos;
begin
  select * into b from public.barberos where id = p_barbero;
  if b.id is null then raise exception 'Barbero no encontrado'; end if;
  if not public.es_dueno(b.barberia_id) then raise exception 'Solo el dueño asigna permisos'; end if;
  update public.barberos set es_admin = coalesce(p_es_admin, false), permisos = coalesce(p_permisos, '{}') where id = b.id;
end $$;
grant execute on function public.barbero_set_permisos(uuid, boolean, text[]) to authenticated;

-- Políticas de escritura: cada módulo con su permiso (antes solo el dueño).
drop policy if exists dueno_escribe on public.pisos;
create policy dueno_escribe on public.pisos for all to authenticated using (public.puede(barberia_id, 'pisos')) with check (public.puede(barberia_id, 'pisos'));
drop policy if exists dueno_escribe on public.sillas;
create policy dueno_escribe on public.sillas for all to authenticated using (public.puede(barberia_id, 'pisos')) with check (public.puede(barberia_id, 'pisos'));
drop policy if exists dueno_escribe on public.servicios_cortes;
create policy dueno_escribe on public.servicios_cortes for all to authenticated using (public.puede(barberia_id, 'servicios')) with check (public.puede(barberia_id, 'servicios'));
drop policy if exists dueno_escribe on public.gamificacion_premios;
create policy dueno_escribe on public.gamificacion_premios for all to authenticated using (public.puede(barberia_id, 'lealtad')) with check (public.puede(barberia_id, 'lealtad'));
drop policy if exists dueno_escribe on public.productos;
create policy dueno_escribe on public.productos for all to authenticated using (public.puede(barberia_id, 'productos')) with check (public.puede(barberia_id, 'productos'));
drop policy if exists "dueño gestiona sus gastos" on public.gastos;
create policy "dueño gestiona sus gastos" on public.gastos for all to authenticated using (public.puede(barberia_id, 'finanzas')) with check (public.puede(barberia_id, 'finanzas'));
drop policy if exists dueno_actualiza on public.barberos;
create policy dueno_actualiza on public.barberos for update to authenticated using (public.puede(barberia_id, 'equipo')) with check (public.puede(barberia_id, 'equipo'));
drop policy if exists dueno_actualiza on public.barberias;
create policy dueno_actualiza on public.barberias for update to authenticated
  using (public.puede(id, 'local') or public.puede(id, 'festivos')) with check (public.puede(id, 'local') or public.puede(id, 'festivos'));

-- Clientes: editar datos (nombre, celular, correo) y eliminar. Lo hace el staff con permiso
-- "clientes" o quien lo registró. Clientes con cuenta propia no se borran desde el panel.
create or replace function public.staff_editar_cliente(p_cliente uuid, p_nombre text, p_telefono text, p_email text)
returns public.clientes
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_nom text := left(trim(coalesce(p_nombre, '')), 60);
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
  v_mail text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null then raise exception 'Cliente no encontrado'; end if;
  if not public.staff_puede_cliente(c.id) then raise exception 'Sin permiso para editar este cliente'; end if;
  if char_length(v_nom) < 2 then raise exception 'Escribe el nombre del cliente'; end if;
  if v_tel is not null and v_tel !~ '^\+?[0-9 ]{6,15}$' then raise exception 'El celular no es válido (6 a 15 números)'; end if;
  if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  update public.clientes set nombre = v_nom, telefono = v_tel, email = v_mail where id = c.id returning * into c;
  return c;
end $$;
grant execute on function public.staff_editar_cliente(uuid, text, text, text) to authenticated;

create or replace function public.staff_puede_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.citas x where x.cliente_id = p_cliente and public.puede(x.barberia_id, 'clientes'))
      or exists (select 1 from public.barberos b where b.usuario_id = auth.uid() and b.id = (
           select registrado_por_barbero_id from public.clientes where id = p_cliente))
$$;

create or replace function public.staff_eliminar_cliente(p_cliente uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.clientes;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null then raise exception 'Cliente no encontrado'; end if;
  if not public.staff_puede_cliente(c.id) then raise exception 'Sin permiso para eliminar este cliente'; end if;
  if c.usuario_id is not null then
    raise exception 'Este cliente tiene cuenta propia: no se puede eliminar desde el panel. Pídele que lo haga desde su perfil.';
  end if;
  -- Su historial de citas se conserva con su nombre, sin el vínculo al documento.
  update public.citas set nombre_walkin = coalesce(nombre_walkin, c.nombre) where cliente_id = c.id;
  delete from public.clientes where id = c.id;
end $$;
grant execute on function public.staff_eliminar_cliente(uuid) to authenticated;
