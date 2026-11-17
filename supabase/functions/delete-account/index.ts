// Edge Function: delete-account
// Borra la cuenta del usuario que llama (y en cascada sus partidas).
// Si el usuario usó Sign in with Apple y la app envía un authorizationCode
// fresco, además revoca sus tokens en Apple (App Store Guideline 5.1.1(v)).
//
// Deploy:   supabase functions deploy delete-account
// Secrets:  supabase secrets set APPLE_TEAM_ID=... APPLE_KEY_ID=... \
//             APPLE_CLIENT_ID=com.mateoalvarez.quiengana APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"

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

  // 1) code → refresh_token
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

  // 2) revocar refresh_token (o access_token si no vino refresh)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const user = userData.user;

  let apple: unknown = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.appleAuthorizationCode) apple = await revokeApple(body.appleAuthorizationCode);
  } catch (e) {
    apple = { revoked: false, reason: String(e) };
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: error.message }, 500);

  return json({ deleted: true, apple });
});
