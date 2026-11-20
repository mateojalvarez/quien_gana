# Amigo invisible — qué se promete y hasta dónde

Mismo rol que `propuesta-grupos.md`: dejar escrito el modelo de confianza, porque
es lo que la UI tiene que respetar y lo que un cambio futuro no puede romper sin
darse cuenta.

## Dos sorteos distintos

El anfitrión elige **al crear el sorteo**, y sólo ahí:

| | **En secreto** (por defecto) | **A la vista** |
|---|---|---|
| `reveal_to_host` | `false` | `true` |
| Quién ve el reparto | nadie | el anfitrión |
| Qué dice el correo | "Ni siquiera quien armó el sorteo sabe a quién le tocó cada uno." | "Quien armó el sorteo puede ver el reparto completo. Nadie más lo ve." |

Aparte y sin relación: el anfitrión decide **si participa**. Si participa, su fila
lleva `user_id` con su propia cuenta —para marcarla como "vos" y para que no
entre dos veces— y recibe su correo como cualquiera. Si no participa, organiza y
nada más.

Las dos cosas son independientes, pero juntas tienen una consecuencia que la
pantalla avisa: **si participás y además mirás el reparto, te enterás de quién te
regala a vos.**

## Por qué no se puede cambiar de opinión

`reveal_to_host` **no está** en la lista de columnas que el anfitrión puede
actualizar (`grant update (…)` al final de la migración). Se fija en el `insert` y
queda congelada.

No es una formalidad. El correo que cada participante ya leyó dice cuál de los
dos modos era. Si la columna se pudiera encender después, el anfitrión prometería
secreto, esperaría a que todos lo lean y recién ahí miraría. Apagarla después
tampoco se puede, por simetría: lo que se prometió, se cumple.

## La promesa del modo secreto

> Cada uno recibe por correo a quién le regala. Nadie ve el resultado de los
> demás. **El anfitrión tampoco.**

## Cómo se sostiene

1. El sorteo se resuelve **dentro de la Edge Function**. Es el único lugar del
   sistema donde la asignación existe en claro, y vive ahí sólo mientras corre.
2. Se guarda en `secret_santa_assignments`, **cifrada con AES-256-GCM**. La
   clave (`AMIGO_CLAVE_V1`) es un secret de la función y nunca estuvo en la base.
   El AAD es el id del participante: mover un ciphertext de una fila a otra lo
   vuelve indescifrable.
3. Esa tabla tiene **RLS activa y cero policies**, y encima se le revocan los
   privilegios a `anon` y `authenticated`. Para PostgREST no existe.
4. En modo a la vista, descifrar lo hace `amigo-invisible-ver`, que chequea
   `reveal_to_host` **del lado del servidor** antes de tocar nada. En modo
   secreto devuelve 403 aunque la llame el dueño del sorteo.
5. El estado de los correos (`sent_at`, `opened_at`, …) lo escribe sólo el
   `service_role`: al anfitrión se le revoca el `UPDATE` y se le devuelve por
   columna. **RLS decide filas, no columnas** — sin esto, un anfitrión con el
   anon key y `curl` podría marcarse aperturas o devolver el sorteo a borrador
   para sortearlo dos veces y cruzar los resultados.

## Hasta dónde llega

Hay que ser honesto en los tres puntos, porque la UI no puede prometer de más:

- **El operador del backend sí puede.** Quien tenga a la vez la base y el secret
  de las funciones descifra. Ese es el desarrollador, **no el anfitrión**, que es
  un usuario final sin consola. Frente al anfitrión la promesa se sostiene; "ni
  el desarrollador puede" sería mentira. `purge_at` (30 días) está para achicar
  esa ventana cuando haya una tarea que lo barra.
- **El anfitrión controla los correos.** Puede poner su propia dirección en el
  lugar de otro y recibir el resultado ajeno. Ninguna criptografía arregla eso.
  La promesa correcta es "la app no se lo muestra", no "le es imposible".
- **Con poca gente, la matemática filtra.** Con 3 participantes, el anfitrión que
  sabe su propio destino deduce el resto con certeza. Por eso el mínimo es 4 y la
  pantalla avisa hasta 6 (`LIMITES` en `src/features/amigo-invisible/rules.ts`).

## El sorteo

Mezclar y rechazar (`supabase/functions/_compartido/amigo/sorteo.ts`): uniforme
sobre todos los repartos válidos, ≈2,7 intentos de promedio. Sattolo resolvería
en una pasada, pero sólo genera permutaciones cíclicas —no es uniforme— y no sabe
de exclusiones. Las exclusiones ("Ana y Beto son pareja") están desde el día uno:
es el pedido número uno en cualquier amigo invisible familiar y meterlas después
obligaría a migrar datos.

## Rebotes y reenvíos

Guardar el cifrado en vez de no guardar nada es lo que permite **reenviar sin
re-sortear**. El caso de falla más común es un correo con una letra de más; con
la asignación tirada, arreglarlo obligaría a sortear de nuevo y avisarle a los
quince que lo anterior no valía.

Corregir el nombre o el correo se puede siempre. Agregar o sacar gente, sólo
mientras el sorteo esté en borrador.

## Apertura: es una señal, no un acuse de recibo

El pixel de 1×1 (`amigo-invisible-pixel`, la única función pública) es lo mejor
que hay sin pedirle nada al participante, y aun así:

- **Apple Mail Privacy Protection** precarga todas las imágenes apenas llega el
  correo, lo haya abierto alguien o no: **falso positivo garantizado**, y es el
  cliente más usado en iPhone. Por eso un pedido a menos de 15 s del envío, o con
  user-agent de proxy, se marca `opened_unreliable`.
- **Gmail** sirve las imágenes por su proxy y cachea: se registra, pero sin IP ni
  dispositivo reales, y la segunda apertura puede no llegar nunca.
- **Outlook y los clientes corporativos** bloquean imágenes por defecto: la
  persona lee el correo entero y **no se registra nada**.

De ahí que la pantalla diga "Señal de apertura" / "Señal automática" / "Enviado",
nunca "lo leyó", y lleve el cartel de que son marcas orientativas. Un tilde verde
que dijera "leído" haría que el anfitrión le reclame a gente que sí leyó.

## La señal que sí vale: "marcar como recibido"

Un clic es intención humana; una imagen cargada no. Por eso el correo lleva
además un botón **«marcar como recibido»**, firmado con el mismo token, y su
confirmación se muestra como **«Le llegó»**: la única marca de la pantalla que
no es una suposición.

El botón abre una página del sitio propio (`sitio/recibido/index.html`) que
postea a `amigo-invisible-recibido`, una función pública que sólo contesta
JSON. La página no sale de la función porque el gateway de Supabase degrada a
`text/plain` cualquier HTML que devuelva una Edge Function, para que nadie use
su dominio para armar un phishing.

Son **dos pasos** —el enlace abre la página y recién ese botón confirma— y no
uno. Outlook Safe Links, Proofpoint y Mimecast abren todos los
enlaces de un correo para escanearlos: si el enlace confirmara al abrirse,
media oficina aparecería confirmada sola, que es justo el falso positivo que
este botón vino a resolver. El GET nunca escribe; sólo el POST del formulario.

La página no nombra a nadie ni dice de qué sorteo se trata: el token viaja por
correo, pero la URL es pública igual.

El pixel se queda al lado del botón, no en su lugar: responde "algo pasó con ese
correo" cuando nadie confirmó nada. Quien no quiera ninguna señal automática
pone `AMIGO_PIXEL=off` y deja sólo el botón.
