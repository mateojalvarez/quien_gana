# Rechazo de Apple — Guideline 2.1, Information Needed

**No es un bug ni un problema del binario.** Es el pedido estándar que Apple le
hace a muchas apps nuevas: quieren entender qué hace la app antes de aprobarla.
Se resuelve escribiendo en **App Store Connect → la versión → App Review
Information → Notes** y volviendo a enviar. El build no hace falta cambiarlo.

De los seis puntos que piden, cinco son texto (están resueltos acá abajo) y uno
—el video— lo tenés que grabar vos en un iPhone de verdad.

---

## 1. El video (esto lo hacés vos)

Pide: grabación **en un dispositivo físico**, con el sistema operativo más nuevo,
que **empiece abriendo la app** y muestre el recorrido típico. Si la app tiene
registro, login y borrado de cuenta, los tres tienen que estar.

Guion, en orden, de unos dos minutos:

1. Abrí la app desde el ícono de la pantalla de inicio (que se vea el arranque).
2. **"Entrar como invitado"** → cae en Inicio. Esto es clave: muestra que la app
   se usa entera sin cuenta.
3. Jugá una partida corta: Juegos → **Corazones** → cargar dos o tres rondas →
   que se vea la tabla.
4. **Dados**, **Pulsador** y **Reloj**, unos segundos cada uno.
5. **Grupos**: crear un grupo, abrir "Invitar" y que se vea el QR y el enlace.
   Mostrá que a un integrante se lo puede sacar (tocando su fila, "Sacar del
   grupo"): es el mecanismo de moderación que Apple pregunta. Ojo que eso sólo
   aparece si sos el dueño y tocás a OTRO integrante con cuenta.
6. Si mandás el build con Live Activities: con la partida de truco abierta,
   bloqueá el teléfono y mostrá el marcador en la pantalla bloqueada; tocá
   "+1 Nos" y que se vea cambiar el número. Desbloqueá y mostrá que la partida
   quedó igual adentro.
7. **Perfil** → "Vincular cuenta de Apple" → hacé el login con Apple de verdad.
   Que se vea el nombre y el correo ya cargados.
8. Perfil → **"Eliminar cuenta"** → confirmá en la hoja → que se vea que vuelve a
   la pantalla de inicio. Apple mira este paso con lupa.

Para grabar: Ajustes → Centro de control → agregá "Grabación de pantalla";
después lo subís a App Store Connect o a un enlace (Drive, Dropbox) que pongas en
las notas.

Antes de grabar, pasá la app por el teléfono de verdad una vez: Apple dice
explícitamente que revisa en dispositivos físicos, y acá siempre la probamos en
el simulador.

---

## 2 a 6. Las notas, para pegar tal cual

Van en inglés, en el campo **Notes** de App Review Information.

```text
PURPOSE AND TARGET AUDIENCE

"¿Quién gana?" ("Who's winning?") is an offline-first scorekeeping companion for
people playing traditional card, dice and board games around a table. It solves a
very small, very common problem: when a group sits down to play, someone has to
find paper and a pen to keep score, dice are missing, and nobody agrees on how
long a turn lasted.

The app replaces those objects with a single tool: a free-form score sheet, a
dedicated score sheet for Hearts, a Truco score sheet (the traditional
Argentine/Uruguayan card game, with matchstick marks), a Generala score sheet
(a dice game similar to Yahtzee), virtual dice (d4 to d20), a buzzer for
quiz-style questions, a turn timer, and a random team generator.

Target audience: families and groups of friends who play together in person,
primarily in Argentina and the rest of Latin America. The app is in Spanish only.
It is a utility, not a game: there is no gameplay, no opponent, no scoring engine
that plays against the user. Nothing is simulated — the user plays a real game
with real cards or dice at a real table and the app only records what happens.

The app is free, has no in-app purchases, no subscriptions, no advertising, and
no real-money or virtual-currency wagering of any kind.

HOW TO SET UP AND ACCESS EVERY FEATURE

No account and no credentials are required. On the first screen, tap
"Entrar como invitado" ("Continue as guest") and the entire app is available
immediately. We are not providing a demo account because none is needed; every
feature below works in guest mode.

- Inicio (Home): the game in progress, favourites and most-played tools.
- Juegos (Games): the catalogue. Tap "Jugar" on any row.
  - Corazones (Hearts): add players, then enter each round's points.
  - Anotador libre (Free score sheet): same, with custom rules.
  - Truco: choose 15 or 30 points, then +1 / -1 per team, with undo.
  - Generala: roll five dice, hold any of them, up to three rolls, then choose
    where to score; the score sheet is on the second tab of that screen.
  - Dados (Dice): choose the die and how many.
  - Pulsador (Buzzer): first player to tap wins the round.
  - Reloj (Timer): set a duration for turns.
  - Equipos (Teams): enter names and optional "cannot be on the same team"
    constraints; the app builds balanced teams.
- Grupos (Groups): optional. Creates a named group of players so they are
  preloaded into every new game. Requires a linked account (see below).
- Perfil (Profile): theme, haptics, the Live Activity switch ("Pantalla
  bloqueada"), linking an account, signing out and deleting the account.

ACCOUNT REGISTRATION, LOGIN AND DELETION

- Registration/login is optional and exists only so a user can keep their match
  history across devices and use Groups. It is offered through Sign in with Apple
  and Google Sign-In. There is no email/password registration, so there are no
  credentials to share.
- A guest can link an account later from Perfil; the local history is merged into
  the account.
- Account deletion is available in the app: Perfil → "Eliminar cuenta". It asks
  for confirmation and then permanently deletes the account, the profile, the
  groups owned by the user and all synced matches. For users who signed in with
  Apple, the app also revokes the Apple token
  (ASAuthorizationAppleIDProvider authorization code) as required by
  Guideline 5.1.1(v).

LIVE ACTIVITIES (LOCK SCREEN AND DYNAMIC ISLAND)

While a game of Truco is in progress, the app shows a Live Activity with the
score, so the table can see it without unlocking the phone. It carries two
buttons to add a point to either team and one to undo, implemented as App
Intents, and it is the reason the app now requires iOS 17.0.

The activity is started, updated and ended entirely on the device: there is no
push token, no APNs payload and no server involved. It ends when the game ends,
and dismisses itself after two hours without changes. A user who does not want it
can switch it off in Perfil → "Pantalla bloqueada".

USER-GENERATED CONTENT

The app has no public content: no feed, no profiles visible to strangers, no
comments, no messaging, no uploads, no photos. The only text a user writes is:
names of players, names of matches and names of groups.

That text is private to the device unless the user creates a Group. A Group is
only reachable through an invitation link or QR code generated by a member, which
expires after 7 days, and it can hold only the people who accept that invitation.
Opening that link leads to a page on quien-gana.app with a button that hands the
invitation to the app; the invitation can also be joined by typing its code in
Grupos, which is the quickest way to test it on a single device.
Inside a group, members see each other's display name and the group's name — and
nothing else.

Moderation, for that limited case: the group's owner can remove any member at any
time (Grupos → the group → the member → "Sacar del grupo"), which immediately
revokes their access, and any member can leave the group or delete their account.
Invitations expire on their own after 7 days, and the owner can revoke an
invitation by generating a new one. Players added to a group who do not have an
account are stored only on the phone of whoever added them and are never uploaded.

EXTERNAL SERVICES

- Supabase (https://supabase.com): hosted authentication and PostgreSQL database.
  It stores the user's account, display name, their matches and their groups, so
  that history survives reinstalling the app. This is the only backend.
- Sign in with Apple: optional authentication.
- Google Sign-In: optional authentication.
- Expo / EAS (https://expo.dev): build and distribution tooling only. It is not
  called at runtime and receives no user data.

The app uses no advertising networks, no analytics or tracking SDKs, no payment
processors and no third-party data providers. Supabase is the only host the app
ever contacts.

The app calls no AI service and runs no model: the illustrations in the interface
were generated with Google Gemini while designing the app and are bundled as
static image files. Nothing a user types or does is ever sent to an AI service.

Note on guest mode: tapping "Entrar como invitado" creates an anonymous Supabase
session, so matches are mirrored to that anonymous record as well as stored on
the device. No name, no email and no device identifier are collected for it, and
the record is discarded when the user deletes the account.

REGIONAL DIFFERENCES

There are none. The app behaves identically in every region and on every network.
It is available in Spanish only (es-419) and has no region-locked features,
no geo-restricted content and no region-specific pricing — it is free everywhere.
Some of the games it keeps score for (Truco, Generala, Chinchón) are most popular
in Argentina and neighbouring countries, but that is a matter of which rules the
score sheets follow, not of what the app does in each region.

REGULATED INDUSTRY AND THIRD-PARTY MATERIAL

The app is not in a regulated industry. It is a scorekeeping utility: there is no
gambling, no betting, no wagering, no real or virtual currency, no prizes, no
health, financial or medical data, and nothing is sold inside the app.

Truco, Generala, Hearts and the other games whose scores the app records are
traditional games in the public domain. The app does not include, reproduce or
simulate any publisher's game, artwork, rules text or trademark.

The clay-style illustrations throughout the interface were generated with Google
Gemini; they are not derived from anyone else's artwork and depict no real
person, brand or protected character. The interface typeface is Jost
(SIL Open Font License 1.1).
```

---

## Lo que falta confirmar antes de enviar

- **Qué build revisan.** Esto es información, no un binario roto, así que podés
  reenviar el 1.0.0 (9) que ya está o esperar al de las Live Activities: las
  notas sirven para los dos. Si mandás el 9, borrá el bloque
  LIVE ACTIVITIES y la mención del interruptor en Perfil, porque esa versión no
  las tiene. Si mandás el nuevo, dejalo todo y acordate de que sube el mínimo de
  iOS a 17.0 y de que el target del widget pide credenciales nuevas.
- **Grabá en un iPhone físico**, con el iOS más nuevo. Con el mínimo en 17.0, el
  teléfono tiene que tener iOS 17 o más.
