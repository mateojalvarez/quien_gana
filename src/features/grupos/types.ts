/** Un integrante con cuenta: existe en la base y lo ve todo el grupo. */
export type RemoteMember = {
  userId: string;
  name: string;
  role: 'admin' | 'member';
  joinedAt: string;
};

/**
 * Un integrante sin cuenta. Queda SOLO en este teléfono (AsyncStorage): no se
 * sube a la base porque son datos de terceros que no aceptaron nada.
 * Lo ve únicamente quien lo cargó.
 */
export type LocalMember = {
  id: string;
  groupId: string;
  name: string;
};

export type Group = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  members: RemoteMember[];
};

export type Invite = {
  code: string;
  expiresAt: string;
};

export type InvitePreview = {
  groupName: string;
  members: number;
  inviter: string | null;
};

/** Lo que se le muestra al usuario, mezclando los dos orígenes. */
export type MemberRow =
  | { kind: 'remote'; id: string; name: string; isAdmin: boolean; isMe: boolean }
  | { kind: 'local'; id: string; name: string };

export const BASE_INVITE_URL = 'https://quien-gana.app/g/';

/** `K7M2PQRX94` → `K7M2-PQRX-94`: para leerlo en voz alta sin equivocarse. */
export const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

export const inviteUrl = (code: string) => BASE_INVITE_URL + code;

/** Acepta el código suelto o la URL entera, con o sin guiones. */
export function codeFromInput(input: string): string | null {
  const limpio = input.trim();
  const path = limpio.includes('/g/') ? limpio.split('/g/')[1] : limpio;
  const code = path.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return code.length === 10 ? code : null;
}
