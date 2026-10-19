-- Borra la demo y la barbería de prueba QA, y reinicia el contador para que la
-- primera barbería real que registres sea B1. (Las cuentas de auth sueltas no estorban.)
delete from public.barberias where nombre like '%(demo)%' or nombre = 'Barberia Test QA';
alter sequence public.barberia_codigo_seq restart with 1;
