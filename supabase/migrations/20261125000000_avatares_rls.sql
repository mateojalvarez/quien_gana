-- ¿Quién gana? — Las políticas del bucket `avatars`, escritas más simples
--
-- Aviso para el que lea el historial: esta migración NO es la que arregló la
-- subida de la foto de perfil. Cuando la escribí creía que el problema era el
-- predicado, y no lo era. La causa está explicada en 20261126000000, que es la
-- que hay que leer: faltaba la policy de `select`.
--
-- Lo que hace esta queda porque ya está aplicada y porque el predicado así es
-- más corto de leer, nada más:
--
--  · sin `(select auth.uid())`: el envoltorio es la recomendación de Supabase
--    para consultas propias, donde ahorra una llamada por fila. Acá es una
--    fila, así que no ahorra nada y sólo mete una subconsulta en el medio;
--  · sin `storage.foldername(name)`: devuelve el arreglo de carpetas y cambió
--    de implementación entre versiones de Storage. `split_part` hace lo mismo
--    y no se mueve.
--
-- Misma seguridad que antes: sólo se escribe dentro de la carpeta propia.

drop policy if exists "avatars: subir el propio" on storage.objects;
create policy "avatars: subir el propio"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "avatars: reemplazar el propio" on storage.objects;
create policy "avatars: reemplazar el propio"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists "avatars: borrar el propio" on storage.objects;
create policy "avatars: borrar el propio"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
