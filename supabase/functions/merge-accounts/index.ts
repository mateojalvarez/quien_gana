// Edge Function: merge-accounts
// Combina dos cuentas reales en una sola. El llamador (JWT del header) es la
// cuenta que SOBREVIVE; la del `sourceAccessToken` aporta sus partidas y se
// elimina. Pedimos un access token válido de cada lado: esa es la prueba de que
// quien llama es dueño de ambas.
//
// Si la cuenta eliminada usaba Sign in with Apple y llega un authorizationCode
// fresco, revocamos sus tokens (App Store Guideline 5.1.1(v)), igual que
// delete-account.
//
// Deploy:  supabase functions deploy merge-accounts
// Secrets: los mismos de delete-account (APPLE_TEAM_ID, APPLE_KEY_ID,
//          APPLE_CLIENT_ID, APPLE_PRIVATE_KEY) para la revocación.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function appleClientSecret() {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  const pem = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !clientId || !pem) return null;
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256');
  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience('https://appleid.apple.com')
    .setSubject(clientId)
    .sign(key);
  return { clientId, secret };
}

async function revokeApple(authorizationCode: string) {
  const creds = await appleClientSecret();
  if (!creds) return { revoked: false, reason: 'apple-secrets-missing' };

  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.secret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return { revoked: false, reason: `token ${tokenRes.status}` };
  const tokens = await tokenRes.json();

  const token = tokens.refresh_token ?? tokens.access_token;
  const hint = tokens.refresh_token ? 'refresh_token' : 'access_token';
  const revokeRes = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.secret,
      token,
      token_type_hint: hint,
    }),
  });
  return { revoked: revokeRes.ok, reason: revokeRes.ok ? null : `revoke ${revokeRes.status}` };
}

type Row = { id: string; updated_at: string };

/**
 * Las partidas viajan de `source` a `target`. Si un id existe en las dos
 * cuentas (mismo dispositivo que subió a ambas), gana la más reciente: el mismo
 * last-write-wins que usa la app al sincronizar.
 */
async function moveGames(
  admin: ReturnType<typeof createClient>,
  sourceId: string,
  targetId: string,
) {
  const { data: sourceRows, error: sourceError } = await admin
    .from('games')
    .select('id, updated_at')
    .eq('user_id', sourceId);
  if (sourceError) throw new Error(`leer origen: ${sourceError.message}`);
  if (!sourceRows?.length) return { moved: 0, discarded: 0 };

  const ids = (sourceRows as Row[]).map((r) => r.id);
  const { data: targetRows, error: targetError } = await admin
    .from('games')
    .select('id, updated_at')
    .eq('user_id', targetId)
    .in('id', ids);
  if (targetError) throw new Error(`leer destino: ${targetError.message}`);

  const targetById = new Map((targetRows as Row[] | null ?? []).map((r) => [r.id, r]));
  const dropFromTarget: string[] = [];
  const dropFromSource: string[] = [];
  for (const row of sourceRows as Row[]) {
    const rival = targetById.get(row.id);
    if (!rival) continue;
    if (new Date(row.updated_at) > new Date(rival.updated_at)) dropFromTarget.push(row.id);
    else dropFromSource.push(row.id);
  }

  if (dropFromTarget.length) {
    const { error } = await admin.from('games').delete().eq('user_id', targetId).in('id', dropFromTarget);
    if (error) throw new Error(`limpiar destino: ${error.message}`);
  }
  if (dropFromSource.length) {
    const { error } = await admin.from('games').delete().eq('user_id', sourceId).in('id', dropFromSource);
    if (error) throw new Error(`limpiar origen: ${error.message}`);
  }

  const { error: moveError } = await admin
    .from('games')
    .update({ user_id: targetId })
    .eq('user_id', sourceId);
  if (moveError) throw new Error(`mover partidas: ${moveError.message}`);

  return { moved: ids.length - dropFromSource.length, discarded: dropFromSource.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const sourceAccessToken = body?.sourceAccessToken;
  if (typeof sourceAccessToken !== 'string' || !sourceAccessToken) {
    return json({ error: 'falta sourceAccessToken' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Ambos tokens tienen que ser válidos ahora mismo: sin eso cualquiera podría
  // pedir que se borre una cuenta ajena.
  const [targetRes, sourceRes] = await Promise.all([
    admin.auth.getUser(jwt),
    admin.auth.getUser(sourceAccessToken),
  ]);
  if (targetRes.error || !targetRes.data.user) return json({ error: 'unauthorized' }, 401);
  if (sourceRes.error || !sourceRes.data.user) return json({ error: 'source token inválido' }, 401);

  const target = targetRes.data.user;
  const source = sourceRes.data.user;
  if (target.id === source.id) return json({ error: 'es la misma cuenta' }, 400);
  if (target.is_anonymous) return json({ error: 'la cuenta que sobrevive no puede ser invitada' }, 400);

  let games: { moved: number; discarded: number };
  try {
    games = await moveGames(admin, source.id, target.id);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }

  let apple: unknown = null;
  const sourceUsedApple = source.identities?.some((i) => i.provider === 'apple') ?? false;
  if (sourceUsedApple && body?.appleAuthorizationCode) {
    try {
      apple = await revokeApple(body.appleAuthorizationCode);
    } catch (e) {
      apple = { revoked: false, reason: String(e) };
    }
  }

  // Recién acá soltamos la cuenta origen: si algo falló antes, no perdimos nada.
  const { error } = await admin.auth.admin.deleteUser(source.id);
  if (error) return json({ error: `borrar origen: ${error.message}`, games }, 500);

  return json({ merged: true, games, apple });
});
