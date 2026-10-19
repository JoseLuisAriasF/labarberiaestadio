-- Datos de DEMO para ver la vista 3D sin cuentas reales. Borrar con demo-borrar.sql.
with b as (
  insert into public.barberias (nombre, descripcion, direccion, distrito, referencia, lat, lng, telefono, whatsapp, yape_numero, titular_pago)
  values ('La Barbería Estadio (demo)', 'Barbería clásica junto al Estadio Nacional.', 'Av. José Díaz 450', 'Cercado de Lima',
          'Frente a la puerta 4 del Estadio Nacional', -12.0672, -77.0338, '987654321', '51987654321', '987654321', 'Barbería Estadio')
  returning id
), p1 as (insert into public.pisos (barberia_id, numero_piso, nombre) select id, 1, 'Piso 1' from b returning id, barberia_id),
   p2 as (insert into public.pisos (barberia_id, numero_piso, nombre) select id, 2, 'Piso 2 · VIP' from b returning id, barberia_id),
   br as (
  insert into public.barberos (barberia_id, usuario, nombre, estado, estado_hasta, cola, debe_cambiar_clave)
  select b.id, x.u, x.n, x.e::public.estado_barbero, case when x.e like 'CORTANDO%' then now() + interval '18 minutes' end, x.c, false
  from b, (values ('carlos','Carlos "Fade"','CORTANDO_CITA',2), ('luis','Luis','LIBRE',0), ('mateo','Mateo','DESCANSO',1), ('jhon','Jhon VIP','CORTANDO_WALKIN',3)) x(u,n,e,c)
  returning id, usuario, barberia_id
), s as (
  insert into public.servicios_cortes (barberia_id, nombre, precio_base, duracion_min)
  select b.id, x.n, x.p, x.d from b, (values ('Corte clásico',20,30), ('Fade + diseño',30,45), ('Barba con toalla caliente',15,20)) x(n,p,d)
)
insert into public.sillas (barberia_id, piso_id, posicion_x, posicion_z, barbero_id)
select br.barberia_id, case when br.usuario = 'jhon' then p2.id else p1.id end,
       case br.usuario when 'carlos' then 2 when 'luis' then 5 when 'mateo' then 8 else 4 end,
       case br.usuario when 'jhon' then 2 else 2 end, br.id
from br, p1, p2;
