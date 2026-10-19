-- El personal sube imágenes a publico/{barberia_id}/… (logo, fotos, cortes, avatares).
drop policy if exists publico_staff_sube on storage.objects;
create policy publico_staff_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'publico' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.es_staff(((storage.foldername(name))[1])::uuid) else false end);

drop policy if exists publico_staff_actualiza on storage.objects;
create policy publico_staff_actualiza on storage.objects for update to authenticated
  using (bucket_id = 'publico' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    then public.es_staff(((storage.foldername(name))[1])::uuid) else false end);
