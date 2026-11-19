# Enlaces universales de quien-gana.app

Para que el QR y el enlace de invitación abran la app directo (y no el navegador),
`apple-app-site-association` tiene que servirse desde el dominio:

    https://quien-gana.app/.well-known/apple-app-site-association

Requisitos de Apple:

- **Sin extensión** en el nombre del archivo (ni `.json`).
- `Content-Type: application/json`.
- Por HTTPS, **sin redirecciones**. Un 301 a `www.` lo rompe.
- Sin autenticación.

El `appIDs` de acá sale de `DEVELOPMENT_TEAM` en el proyecto de Xcode (`X77V463WTL`)
más el bundle id (`com.mateoalvarez.quiengana`). Si cambiás de cuenta de desarrollador,
hay que actualizarlo.

Del lado de la app, `ios.associatedDomains` en `app.json` ya declara
`applinks:quien-gana.app`. Eso es configuración nativa: **requiere rebuild**
(`npx expo prebuild && npm run ios`, o un build de EAS). No alcanza con recargar Metro.

## Conviene además una página en /g/:id

Quien reciba el enlace sin tener la app instalada va a caer en el navegador.
Una página simple que diga "Te invitaron a un grupo en ¿Quién gana?" con el botón
a la App Store (`https://apps.apple.com/app/id6835432271`) evita el 404.
iOS guarda el enlace, así que al instalar y abrir, la invitación se retoma.

## Android

El equivalente es `assetlinks.json` en `/.well-known/`, con el SHA-256 de la firma
de la app. Todavía no lo armé porque la etapa 2 se probó en iOS.
