-- Venta de productos desde el modo barbero: cualquier barbero cobra y el stock baja en la misma transacción.
-- Historial de ventas y reposiciones para que el dueño decida qué reponer y qué empujar.

create table if not exists public.ventas_productos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null,                       -- agrupa las líneas de un mismo cobro
  barberia_id uuid not null references public.barberias on delete cascade,
  barbero_id uuid not null references public.barberos on delete cascade,
  producto_id uuid references public.productos on delete set null,
  nombre_producto text not null,                -- copia del nombre: el historial sobrevive si se borra el producto
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(10, 2) not null check (precio_unitario >= 0),
  metodo_pago public.metodo_pago not null,
  created_at timestamptz not null default now()
);
create index if not exists ventas_productos_barberia_fecha on public.ventas_productos (barberia_id, created_at);

create table if not exists public.reposiciones_producto (
  id uuid primary key default gen_random_uuid(),
  barberia_id uuid not null references public.barberias on delete cascade,
  producto_id uuid references public.productos on delete set null,
  nombre_producto text not null,
  cantidad int not null check (cantidad > 0),
  costo_unitario numeric(10, 2) check (costo_unitario is null or costo_unitario >= 0),
  stock_resultante int not null,
  created_at timestamptz not null default now()
);
create index if not exists reposiciones_producto_barberia_fecha on public.reposiciones_producto (barberia_id, created_at);

alter table public.ventas_productos       enable row level security;
alter table public.reposiciones_producto  enable row level security;
-- Escribir solo por RPC (security definer). Leer: quien ve estadísticas.
revoke insert, update, delete on public.ventas_productos, public.reposiciones_producto from anon, authenticated;

drop policy if exists ver_ventas_productos on public.ventas_productos;
create policy ver_ventas_productos on public.ventas_productos for select to authenticated
  using (public.puede(barberia_id, 'estadisticas'));
drop policy if exists ver_reposiciones on public.reposiciones_producto;
create policy ver_reposiciones on public.reposiciones_producto for select to authenticated
  using (public.puede(barberia_id, 'estadisticas'));

-- Cobra un carrito: valida stock de todas las líneas y descuenta, o no hace nada.
-- Cualquier barbero activo cobra con su propia cuenta; el dueño puede cobrar por cualquier barbero.
create or replace function public.vender_productos(p_barbero uuid, p_items jsonb, p_metodo public.metodo_pago)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  br public.barberos;
  it jsonb;
  pr public.productos;
  v_cant int;
  venta uuid := gen_random_uuid();
begin
  select * into br from public.barberos where id = p_barbero and activo;
  if br.id is null or not public.es_staff(br.barberia_id) then raise exception 'Sin permiso para vender'; end if;
  if not (br.usuario_id = auth.uid() or public.es_dueno(br.barberia_id)) then raise exception 'Sin permiso para vender'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'La venta necesita entre 1 y 30 líneas';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::int;
    if v_cant is null or v_cant not between 1 and 50 then raise exception 'Cantidad no válida'; end if;
    select * into pr from public.productos
     where id = (it->>'producto_id')::uuid and barberia_id = br.barberia_id and activo for update;
    if pr.id is null then raise exception 'Un producto ya no está a la venta'; end if;
    if pr.stock < v_cant then raise exception 'Stock insuficiente de %: quedan %', pr.nombre, pr.stock; end if;

    update public.productos set stock = stock - v_cant where id = pr.id;
    insert into public.ventas_productos (venta_id, barberia_id, barbero_id, producto_id, nombre_producto, cantidad, precio_unitario, metodo_pago)
    values (venta, br.barberia_id, br.id, pr.id, pr.nombre, v_cant, pr.precio, p_metodo);
  end loop;
  return venta;
end $$;
grant execute on function public.vender_productos(uuid, jsonb, public.metodo_pago) to authenticated;

-- Repone stock de un producto y deja registro (costo opcional para calcular margen).
create or replace function public.reponer_stock(p_producto uuid, p_cantidad int, p_costo numeric default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  pr public.productos;
  v_nuevo int;
begin
  select * into pr from public.productos where id = p_producto for update;
  if pr.id is null then raise exception 'Producto no encontrado'; end if;
  if not public.puede(pr.barberia_id, 'productos') then raise exception 'Sin permiso para reponer stock'; end if;
  if p_cantidad is null or p_cantidad not between 1 and 10000 then raise exception 'Cantidad a reponer no válida'; end if;

  update public.productos set stock = stock + p_cantidad where id = pr.id returning stock into v_nuevo;
  insert into public.reposiciones_producto (barberia_id, producto_id, nombre_producto, cantidad, costo_unitario, stock_resultante)
  values (pr.barberia_id, pr.id, pr.nombre, p_cantidad, p_costo, v_nuevo);
  return v_nuevo;
end $$;
grant execute on function public.reponer_stock(uuid, int, numeric) to authenticated;
