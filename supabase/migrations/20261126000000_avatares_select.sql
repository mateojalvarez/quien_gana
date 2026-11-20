-- ¿Quién gana? — La policy que faltaba en el bucket `avatars`
--
-- Esta es la causa real de que subir la foto de perfil siempre contestara
-- "new row violates row-level security policy" y de que `storage.objects` del
-- bucket estuviera vacío. La migración anterior (20261125000000) apuntaba al
-- predicado, y el predicado estaba bien: el que faltaba era el `select`.
--
-- El bucket tenía policies de insert, update y delete, ninguna de select. Las
-- fotos se leen por URL pública, que no pasa por RLS, así que parecía que no
-- hacía falta. Pero Storage no inserta a secas: hace
--
--   insert into storage.objects (…) values (…)
--     on conflict (bucket_id, name) do update …
--     returning *, (select o.id from storage.objects o where …), …
--
-- y Postgres, cuando un insert tiene `returning`, aplica también las políticas
-- de SELECT a la fila nueva. Sin ninguna, la fila no se puede leer y el insert
-- entero se cae con el mensaje del WITH CHECK, que es lo que lo hacía tan
-- difícil de leer: el error habla de la fila nueva y el problema era la
-- lectura. Se comprobó statement por statement en el stack local: el insert
-- pelado pasa, el mismo insert con `returning` falla.
--
-- Alcance: la carpeta propia, igual que las otras tres. Con eso le alcanza a
-- Storage para subir, reemplazar y borrar. Las fotos de los demás se siguen
-- viendo por su URL pública, que no necesita policy.

drop policy if exists "avatars: ver los propios" on storage.objects;
create policy "avatars: ver los propios"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
