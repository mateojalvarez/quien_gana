-- Amigo invisible: "Traer los del grupo" llegaba sin correos porque el mail
-- vive en auth.users y profiles no lo tiene. Esta RPC se los da SOLO a quien
-- ya es integrante del mismo grupo, que es con quien uno los compartió al
-- sumarse. No expone nada a terceros ni a invitados.

create or replace function public.group_member_contacts(gid uuid)
returns table (user_id uuid, name text, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_group_member(gid) then
    raise exception 'no_es_del_grupo' using errcode = '42501';
  end if;

  return query
  select m.user_id,
         coalesce(p.nickname, p.display_name),
         u.email::text
    from public.group_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
   where m.group_id = gid;
end;
$$;

revoke execute on function public.group_member_contacts(uuid) from public, anon;
grant  execute on function public.group_member_contacts(uuid) to authenticated;
