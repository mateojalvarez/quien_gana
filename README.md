# ¿Quién gana?

Hub de mesa: Anotador, Corazones, Dados, Pulsador, Reloj de arena, Equipos,
Ruleta de premios y Amigo invisible.
Expo SDK 58 · Expo Router · Supabase (auth + Postgres) · local-first.

## Arrancar

Lo que hay que configurar afuera (Supabase, Resend, Apple, Google, EAS y el
dominio), paso a paso: **[docs/configuracion-externa.md](docs/configuracion-externa.md)**.

```bash
npm install
cp .env.example .env          # completar URL y publishable key de Supabase
npx eas-cli@latest build --profile development --platform ios   # dev build (Apple Sign In necesita build propia)
npx expo start --dev-client
```

Expo Go sirve para probar UI, Google e invitado; Sign in with Apple requiere development build.

## Estructura

```
src/app/               rutas (Expo Router)
  login.tsx            Apple (nativo iOS) · Google (OAuth) · invitado (anónimo)
  (app)/               rutas protegidas: hub, anotador, corazones, dados, pulsador, reloj, ajustes
src/lib/auth.ts        todos los flujos de auth + vincular invitado + borrar cuenta
src/lib/sync.ts        sync local-first con public.games (last-write-wins)
src/features/corazones/rules.ts   ⚠️ reglas de puntaje configurables
src/theme/tokens.ts    paleta, tipografías, espaciados
src/lib/avatar.ts      foto de perfil: la propia (bucket `avatars`) y la de Apple/Google
supabase/migrations/   esquema + RLS
supabase/functions/delete-account/   borrado de cuenta + revocación de Apple
supabase/functions/merge-accounts/   fusión de dos cuentas (la de origen se elimina)
supabase/functions/amigo-invisible-*/  sorteo, reenvío, ver el reparto y pixel de apertura
supabase/propuesta-amigo-invisible.md  ⚠️ qué se promete del secreto y hasta dónde llega
docs/configuracion-externa.md     Supabase, Resend, Apple, Google, EAS y el dominio
```

## Backend local (Docker)

Requiere Docker Desktop u OrbStack abierto.

```bash
cp supabase/.env.example supabase/.env      # Client ID/Secret de Google
npm run db:start                            # Supabase en Docker (API :54321, Studio :54323)
npm run env:local                           # simulador; `-- --device` para iPhone físico
npx expo start --dev-client -c
npm run env:cloud                           # volver a la nube
```

Google en local sólo funciona en el simulador (redirect `http://127.0.0.1:54321/auth/v1/callback`).

### Correos del amigo invisible

```bash
cp supabase/functions/.env.example supabase/functions/.env   # generar las dos claves
openssl rand -base64 32                                      # AMIGO_CLAVE_V1 y AMIGO_LINK_SECRET
npx supabase functions serve --env-file supabase/functions/.env
```

Con `MAIL_PROVIDER=smtp` los correos no salen a internet: van al buzón de pruebas
que se lee en <http://127.0.0.1:54324>. En producción es `resend`, con el dominio
verificado en Resend (SPF y DKIM) o los envíos se rechazan.

`AMIGO_CLAVE_V1` cifra quién le regala a quién. Si se pierde, los sorteos viejos
no se pueden reenviar nunca más.

Cada correo lleva un botón **«marcar como recibido»**: el participante lo toca,
confirma en <https://quien-gana.app/recibido> y el anfitrión ve «Le llegó». Es
la única señal firme — el pixel de apertura queda como pista. `AMIGO_PIXEL=off`
lo apaga y deja sólo el botón.

Esa página no está en este repo: vive en **quien-gana-web** (`app/recibido/`),
que es el sitio de quien-gana.app. No puede ser la Edge Function directamente
porque el gateway de Supabase degrada a `text/plain` cualquier HTML que
devuelva una función.

#### En producción: cargar los secrets

Las Edge Functions no leen `.env` ni `.env.local` (eso es del cliente): los
secrets se cargan en el proyecto. Sin ellos el sorteo contesta
`config_incompleta` y la app muestra cuáles faltan, sin tocar el estado del
sorteo.

```bash
npx supabase secrets set --project-ref TU_REF MAIL_PROVIDER=resend RESEND_API_KEY=re_xxx MAIL_FROM=amigoinvisible@tu-dominio.com MAIL_FROM_NAME='¿Quién gana?' AMIGO_CLAVE_V1="$(openssl rand -base64 32)" AMIGO_LINK_SECRET="$(openssl rand -base64 32)" FUNCIONES_BASE_URL=https://TU_REF.supabase.co/functions/v1
```

Guardá `AMIGO_CLAVE_V1` aparte ANTES de cargarla: Supabase no la vuelve a
mostrar y sin ella los sorteos viejos no se reenvían más. El dominio de
`MAIL_FROM` tiene que estar verificado en Resend (SPF y DKIM). Después,
`npx supabase functions deploy amigo-invisible-sortear` (y `-reenviar`, `-ver`),
más `--no-verify-jwt` en `-pixel` y `-recibido`, que los abre el correo.

Al crear un sorteo el anfitrión elige dos cosas, y **sólo ahí**: si participa, y
si puede ver el reparto. Lo segundo queda congelado (`reveal_to_host` no está
entre las columnas que puede actualizar) porque el correo de cada participante ya
le dijo cuál de los dos modos era. Ver `supabase/propuesta-amigo-invisible.md`.

## Scripts

`npm run typecheck` · `npm run lint` · `npx expo-doctor`

⚠️ **Después de agregar o sacar una dependencia, regenerá el lock con npm 10**:

```bash
npx -y npm@10.9.9 install --package-lock-only
```

EAS corre npm 10 y acá hay npm 11. `@bacons/apple-targets` necesita una copia
anidada de TypeScript 5: npm 10 la exige escrita en el lock y npm 11 la resuelve
sin escribirla. Si el lock se genera con npm 11, el build muere en `npm ci` con
"Missing: typescript@5.9.3 from lock file" antes de compilar nada, y acá no se
nota porque `node_modules` ya está armado.

## Publicar

```bash
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform ios
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --platform android
```

Guía completa de auth, keys y publicación: ver el doc "¿Quién gana? — Auth, keys y publicación".
