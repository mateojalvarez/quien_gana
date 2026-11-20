# Las páginas de quien-gana.app

El dominio está en Cloudflare y no se despliega desde este repo: estos archivos
se suben a mano. Acá están para que el HTML viva al lado del código que lo
necesita y no se pierda el motivo de cada uno.

| Ruta en el sitio | Archivo | Para qué |
| --- | --- | --- |
| `/recibido` | `recibido/index.html` | El botón "marcar como recibido" del correo del amigo invisible. |
| `/.well-known/apple-app-site-association` | `../store/well-known/` | Enlaces universales. Ver el README de ahí. |

## /recibido

Es una página estática con un botón que postea a la Edge Function
`amigo-invisible-recibido`. Abrirla no confirma nada: Outlook Safe Links,
Proofpoint y Mimecast abren todos los enlaces de un correo para escanearlos, y
si abrir confirmara, media oficina aparecería confirmada sola.

Tiene que ser una página del dominio propio y no la función directamente,
porque el gateway de Supabase le reescribe el Content-Type a `text/plain` a
cualquier respuesta HTML de una Edge Function —a propósito, para que nadie use
su dominio para armar un phishing— y el navegador muestra el código fuente.

El `ENDPOINT` del `<script>` apunta al proyecto de Supabase. Si cambia el
proyecto, hay que actualizarlo acá y en `SITIO_BASE_URL` del lado de las
funciones, que es el origen que la función acepta por CORS.

El token llega en `?t=`. La página no lo guarda ni lo manda a ningún otro lado,
y lleva `referrer: no-referrer` para que no se escape por el `Referer`.
