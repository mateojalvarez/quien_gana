// Todas las llamadas a Supabase de la etapa 2 viven acá.
// Las políticas RLS están en supabase/migrations/20261118000000_grupos.sql:
// unirse pasa sí o sí por las RPC, nunca por un select a group_invites.

import { supabase } from '@/lib/supabase';
import type { Group, Invite, InvitePreview, RemoteMember } from './types';

type GroupRow = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  group_members: { user_id: string; role: 'admin' | 'member'; joined_at: string }[];
};

/** Los nombres viven en profiles; RLS sólo deja ver los de mi propio grupo. */
async function namesOf(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id] = p.display_name || 'Sin nombre';
  return out;
}

export async function listGroups(): Promise<Group[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, owner_id, created_at, group_members (user_id, role, joined_at)')
    .order('created_at', { ascending: true });
  if (error || !data) throw error ?? new Error('sin datos');

  const rows = data as unknown as GroupRow[];
  const names = await namesOf([...new Set(rows.flatMap((g) => g.group_members.map((m) => m.user_id)))]);

  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    ownerId: g.owner_id,
    createdAt: g.created_at,
    members: g.group_members
      .map<RemoteMember>((m) => ({
        userId: m.user_id,
        name: names[m.user_id] ?? 'Sin nombre',
        role: m.role,
        joinedAt: m.joined_at,
      }))
      // el admin primero, después por antigüedad
      .sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.joinedAt.localeCompare(b.joinedAt)),
  }));
}

export async function createGroup(name: string): Promise<string> {
  // El trigger on_group_created mete al creador como admin.
  const { data, error } = await supabase.from('groups').insert({ name: name.trim() }).select('id').single();
  if (error || !data) throw error ?? new Error('no se pudo crear');
  return data.id as string;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('groups').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) throw error;
}

/** Salir del grupo, o que un admin eche a otro. Al dueño no lo echa nadie (RLS). */
export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}

export async function createInvite(groupId: string): Promise<Invite> {
  const { data, error } = await supabase.rpc('create_group_invite', { gid: groupId });
  if (error) throw error;
  const row = (data as { code: string; expires_at: string }[])?.[0];
  if (!row) throw new Error('sin invitación');
  return { code: row.code, expiresAt: row.expires_at };
}

/** La invitación vigente del grupo, si hay; si no, una nueva. */
export async function currentInvite(groupId: string): Promise<Invite> {
  const { data } = await supabase
    .from('group_invites')
    .select('code, expires_at')
    .eq('group_id', groupId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  const vigente = data?.[0];
  if (vigente) return { code: vigente.code, expiresAt: vigente.expires_at };
  return createInvite(groupId);
}

export async function previewInvite(code: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('preview_group_invite', { invite_code: code });
  if (error) throw error;
  const row = (data as { group_name: string; members: number; inviter: string | null }[])?.[0];
  return row ? { groupName: row.group_name, members: row.members, inviter: row.inviter } : null;
}

export type JoinError = 'necesita_cuenta' | 'invitacion_invalida' | 'desconocido';

export async function joinByCode(code: string): Promise<{ groupId: string } | { error: JoinError }> {
  const { data, error } = await supabase.rpc('join_group_by_code', { invite_code: code });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('necesita_cuenta')) return { error: 'necesita_cuenta' };
    if (msg.includes('invitacion_invalida')) return { error: 'invitacion_invalida' };
    return { error: 'desconocido' };
  }
  return { groupId: data as string };
}

/** El grupo activo viaja con la cuenta: en un teléfono nuevo ya está elegido. */
export async function setActiveGroupRemote(userId: string, groupId: string | null): Promise<void> {
  await supabase.from('profiles').update({ active_group_id: groupId }).eq('id', userId);
}

export async function getActiveGroupRemote(userId: string): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('active_group_id').eq('id', userId).single();
  return (data?.active_group_id as string | null) ?? null;
}
