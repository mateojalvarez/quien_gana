# Configuración externa

Todo lo que vive fuera del repo y sin lo cual algo de la app no anda: Supabase,
Resend, Apple, Google, EAS y el dominio. El orden importa: cada paso usa valores
del anterior.

Al lado de cada bloque está **qué se rompe si falta**, para saber qué se puede
dejar para después.

Convención: `TU_REF` es el project ref de Supabase (lo que va antes de
`.supabase.co`, por ejemplo `abcdefghijklmnop`).

---

## 1. Supabase — el proyecto

*Si falta: no anda nada. Es lo primero.*

1. **Crear el proyecto** en <https://supabase.com/dashboard>. Región: São Paulo
   (`sa-east-1`) es la más cerca. Guardá la contraseña de la base, no se vuelve a
   mostrar.
2. **Claves del cliente**: Project Settings → API Keys. Van al `.env` del repo
   (es el del cliente, lo lee Expo; las Edge Functions NO lo leen):

   ```bash
   cp .env.example .env
   ```

   - `EXPO_PUBLIC_SUPABASE_URL` = `https://TU_REF.supabase.co`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = la publishable (`sb_publishable_…`).
     Es pública a propósito: lo que protege los datos es RLS, no esta clave.

3. **Esquema**: enlazar y empujar las migraciones de `supabase/migrations/`.

   ```bash
   npx supabase link --project-ref TU_REF
   ```

   ```bash
   npx supabase db push
   ```

   Esto crea también el bucket `avatars` (migración `20261121000000_avatares.sql`)
   con sus políticas, así que no hay que tocar Storage a mano.

4. **URLs de auth**: Authentication → URL Configuration. `supabase/config.toml`
   sólo vale para el Supabase local; en la nube hay que repetirlo a mano.

   - Site URL: `quiengana://`
   - Redirect URLs: `quiengana://auth-callback`, `exp://**`,
     `http://localhost:8081/**`

   *Si falta: Google te deja afuera después de autenticar ("redirect not allowed").*

5. **Métodos de ingreso**: Authentication → Sign In / Providers.

   - **Anonymous sign-ins: ON**. Es el modo invitado, con el que arranca todo el
     mundo. *Si falta: la pantalla de login no deja entrar.*
   - **Manual linking: ON**. Es vincular el invitado a Apple/Google desde Perfil
     sin perder las partidas. *Si falta: `linkIdentity` falla.*
   - Apple y Google se configuran en los pasos 3 y 4 de abajo.

---

## 2. Edge Functions y sus secrets

*Si falta: borrar cuenta no revoca Apple, fusionar cuentas no anda, y el amigo
invisible no manda ni un correo.*

Las funciones no leen `.env` ni `.env.local`: leen **secrets del proyecto**.
Cargalos antes de desplegar.

```bash
npx supabase secrets set --project-ref TU_REF MAIL_PROVIDER=resend RESEND_API_KEY=re_xxx MAIL_FROM=amigoinvisible@quien-gana.app MAIL_FROM_NAME='¿Quién gana?' AMIGO_CLAVE_V1="$(openssl rand -base64 32)" AMIGO_LINK_SECRET="$(openssl rand -base64 32)" FUNCIONES_BASE_URL=https://TU_REF.supabase.co/functions/v1
```

```bash
npx supabase secrets set --project-ref TU_REF APPLE_TEAM_ID=X77V463WTL APPLE_CLIENT_ID=com.mateoalvarez.quiengana APPLE_KEY_ID=XXXXXXXXXX APPLE_PRIVATE_KEY="$(cat ~/Downloads/AuthKey_XXXXXXXXXX.p8)"
```

⚠️ **`AMIGO_CLAVE_V1` guardala aparte antes de cargarla** (gestor de
contraseñas). Es la que descifra quién le regala a quién: Supabase no la vuelve a
mostrar y sin ella ningún sorteo viejo se puede reenviar nunca más. Si se filtra,
en cambio, se puede leer el reparto entero.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo: no se
cargan.

`FUNCIONES_BASE_URL` es de dónde salen los dos enlaces que lleva el correo: el
pixel de apertura y el botón «marcar como recibido». Si falta, el correo sale
sin ninguno de los dos y el anfitrión nunca se entera de nada. `AMIGO_PIXEL=off`
apaga el pixel y deja sólo el botón.

`SITIO_BASE_URL` (default `https://quien-gana.app`) es el dominio donde está la
página del botón, que es además el único origen que la función acepta por CORS.
La página se sube a mano al sitio: ver `sitio/README.md`. **No se puede servir
el HTML desde la función**: el gateway de Supabase le reescribe el
`Content-Type` a `text/plain` y el navegador muestra el código fuente.

Después, desplegar. Las dos funciones que abre el correo van con
`--no-verify-jwt`, porque ni el cliente de correo ni el navegador del
participante mandan headers de auth:

```bash
npx supabase functions deploy delete-account merge-accounts amigo-invisible-sortear amigo-invisible-reenviar amigo-invisible-ver
```

```bash
npx supabase functions deploy amigo-invisible-pixel --no-verify-jwt
npx supabase functions deploy amigo-invisible-recibido --no-verify-jwt
```

La lista completa de variables, con qué hace cada una, está en
`supabase/functions/.env.example` (ese archivo es para correr las funciones en
local, no se sube a ningún lado).

---

## 3. Resend — los correos del amigo invisible

*Si falta: el sorteo falla con `config_incompleta` y queda en borrador.*

1. Cuenta en <https://resend.com>.
2. **Domains → Add Domain**: `quien-gana.app` (o un subdominio tipo
   `mail.quien-gana.app`, que aísla la reputación del dominio principal).
3. Resend te da tres registros para cargar en el DNS del dominio:
   - **SPF** — TXT en el dominio del envío.
   - **DKIM** — un TXT (o CNAME) con la clave pública.
   - **DMARC** — opcional pero conviene: `v=DMARC1; p=none; rua=mailto:vos@…`
     para enterarte de los rebotes antes que los usuarios.

   Propagan en minutos; el panel queda en **Verified** cuando están.
4. **API Keys → Create**: permiso *Sending access* alcanza. Esa clave es
   `RESEND_API_KEY` del paso 2.
5. `MAIL_FROM` **tiene que ser del dominio verificado**. Si no, Resend rechaza el
   envío con "domain is not verified" y el anfitrión ve ese texto tal cual.
6. Plan gratis: 100 correos por día y 2 pedidos por segundo. El código ya respeta
   el segundo límite (`RESPIRO_MS` en `_compartido/amigo/envio.ts`), pero un
   sorteo de 40 personas se come casi la mitad del día.

Para probar sin gastar envíos está el camino local: `MAIL_PROVIDER=smtp` y los
correos quedan en el buzón de <http://127.0.0.1:54324>.

---

## 4. Apple

### 4.1 App ID — *necesario para compilar*

En <https://developer.apple.com> → Certificates, Identifiers & Profiles →
Identifiers, el App ID `com.mateoalvarez.quiengana` (Team `X77V463WTL`) con:

- **Sign in with Apple** habilitado.
- **App Groups**: `group.com.mateoalvarez.quiengana` — es el que comparten la app
  y el widget de Live Activities.

EAS puede crear todo esto solo la primera vez que buildeás, si lo dejás.

### 4.2 Provider Apple en Supabase — *si falta, "Continuar con Apple" no ingresa*

Authentication → Providers → Apple: **Client IDs** = `com.mateoalvarez.quiengana`.
Para el login nativo de iOS no hace falta secret: alcanza con el bundle id en esa
lista.

### 4.3 Key .p8 para revocar — *si falta, borrar la cuenta no revoca el token*

Apple **exige** que al borrar la cuenta se revoque su token; si no, puede rechazar
la revisión. En Keys → "+", una key nueva con **Sign in with Apple** habilitado.
El `.p8` se descarga **una sola vez**.

De ahí salen `APPLE_KEY_ID` (el nombre del archivo) y `APPLE_PRIVATE_KEY` (el
contenido entero, con los `-----BEGIN…`), que son secrets del paso 2.

### 4.4 Services ID — *sólo para Apple en Android*

Un Services ID aparte (por ejemplo `com.mateoalvarez.quiengana.web`), con
Return URL `https://TU_REF.supabase.co/auth/v1/callback`, y un secret JWT firmado
con la key del 4.3. Va en `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` y se prende con
`EXPO_PUBLIC_APPLE_WEB_ENABLED=true` en el `.env`. En iOS no se usa.

### 4.5 App Store Connect

La app ya existe: `ascAppId` **6835432271** en `eas.json`. Ahí se cargan fichas,
capturas y la política de privacidad (ver `store/app-store-es.md` y
`store/revision-apple.md`).

---

## 5. Google

### 5.1 Ingresar con Google — *si falta, el botón de Google no hace nada*

1. <https://console.cloud.google.com> → proyecto nuevo.
2. Google Auth Platform → **OAuth consent screen**: tipo External, nombre de la
   app, correo de soporte, dominio. Mientras esté en *Testing* sólo entran las
   cuentas de prueba que cargues: publicalo antes de la salida.
3. **Clients → Create → Web application**. En *Authorized redirect URIs*:
   - `https://TU_REF.supabase.co/auth/v1/callback` (nube)
   - `http://127.0.0.1:54321/auth/v1/callback` (Supabase local)
4. El Client ID y el Client Secret van a Supabase → Authentication → Providers →
   Google. Para el Supabase local, los mismos dos valores van a `supabase/.env`
   (ver `supabase/.env.example`).

En local, Google sólo funciona en el simulador: el redirect es a `127.0.0.1`, que
en un iPhone físico es el propio teléfono.

### 5.2 Google Play — *sólo para publicar en Android*

Play Console → Setup → API access → cuenta de servicio con permiso de release. El
JSON va a `secrets/google-play-service-account.json`, que es la ruta que ya espera
`eas.json` (la carpeta `secrets/` no se commitea).

---

## 6. EAS (Expo)

*Si falta: el build sale sin las claves de Supabase y la app arranca sin backend.*

El `projectId` y el owner ya están en `app.json`. Lo que hay que configurar es que
**las `EXPO_PUBLIC_*` existan en EAS**: el `.env` local no viaja al build, y
`eas.json` pide los environments `development`, `preview` y `production`.

```bash
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://TU_REF.supabase.co --visibility plaintext
```

Lo mismo con `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, y repetido para
`development` y `preview` (o `--environment production,preview,development`).
`npx eas-cli@latest env:list` muestra lo que hay cargado.

Las credenciales de firma (certificados de iOS, keystore de Android) las maneja
EAS solo la primera vez que buildeás; decile que sí.

---

## 7. El dominio quien-gana.app

*Si falta: el enlace de invitación abre el navegador en vez de la app.*

`BASE_INVITE_URL` en `src/features/grupos/types.ts` apunta a
`https://quien-gana.app/g/`, así que el dominio tiene que:

1. Servir `https://quien-gana.app/.well-known/apple-app-site-association` — sin
   extensión, `Content-Type: application/json`, por HTTPS, **sin redirecciones**
   (un 301 a `www.` lo rompe) y sin autenticación. El contenido está en
   `store/well-known/`.
2. Tener una página en `/g/:code` para el que todavía no instaló la app, con el
   botón a `https://apps.apple.com/app/id6835432271`. iOS se guarda el enlace y
   retoma la invitación después de instalar.
3. Android: `assetlinks.json` en `/.well-known/`, con el SHA-256 de la firma
   (`npx eas-cli@latest credentials` lo muestra). Todavía no está armado.

⚠️ **Pendiente del lado de la app**: `app.json` no declara
`ios.associatedDomains: ["applinks:quien-gana.app"]`, aunque
`store/well-known/README.md` dice que sí. Hasta agregarlo (y rebuildear, porque es
configuración nativa) los enlaces universales no abren la app por más que el
`apple-app-site-association` esté perfecto.

---

## Orden mínimo para tener algo andando

1. Supabase: proyecto, `.env`, `db push`, redirect URLs, anónimo + manual linking.
   → Ya entrás como invitado y jugás todo lo local.
2. Google y/o Apple provider. → Cuentas de verdad y grupos.
3. Secrets + deploy de las funciones. → Borrar cuenta y fusionar.
4. Resend + DNS. → Amigo invisible.
5. EAS env + build. → Probar en un teléfono de verdad.
6. Dominio. → Que el QR abra la app.
