# ¿Quién gana?

Hub de mesa: Anotador, Corazones, Dados, Pulsador y Reloj de arena.
Expo SDK 58 · Expo Router · Supabase (auth + Postgres) · local-first.

## Arrancar

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
supabase/migrations/   esquema + RLS
supabase/functions/delete-account/   borrado de cuenta + revocación de Apple
supabase/functions/merge-accounts/   fusión de dos cuentas (la de origen se elimina)
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

## Scripts

`npm run typecheck` · `npm run lint` · `npx expo-doctor`

## Publicar

```bash
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform ios
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --platform android
```

Guía completa de auth, keys y publicación: ver el doc "¿Quién gana? — Auth, keys y publicación".
