// Por dónde salen los mails.
//
// En producción, Resend por su API HTTP: desde una Edge Function un POST es
// mucho más confiable que abrir un socket TCP, y la respuesta trae el id del
// mensaje, que es lo único que sirve para rastrear un rebote en su panel.
//
// En local no hay Resend: `MAIL_PROVIDER=smtp` apunta al buzón de pruebas que
// levanta `supabase start` (se lee en http://127.0.0.1:54324) y así se puede
// probar el sorteo entero sin gastar envíos ni molestar a nadie.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export type Carta = { para: string; asunto: string; html: string; texto: string };

export type Cartero = {
  /** Devuelve el id del proveedor si lo da, para poder rastrear un rebote. */
  enviar: (carta: Carta) => Promise<string | null>;
  cerrar: () => Promise<void>;
};

function remitente() {
  const from = Deno.env.get('MAIL_FROM');
  if (!from) throw new Error('falta el secret MAIL_FROM');
  return { from, nombre: Deno.env.get('MAIL_FROM_NAME') ?? '¿Quién gana?' };
}

function porResend(): Cartero {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('falta el secret RESEND_API_KEY');
  const { from, nombre } = remitente();
  const replyTo = Deno.env.get('MAIL_REPLY_TO');

  return {
    async enviar(carta) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${nombre} <${from}>`,
          to: [carta.para],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject: carta.asunto,
          html: carta.html,
          // La parte de texto plano va siempre: sin ella muchos filtros
          // mandan el mail a spam y la feature entera parece rota.
          text: carta.texto,
          headers: { 'Auto-Submitted': 'auto-generated' },
        }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) {
        // El mensaje de Resend es claro ("domain not verified", "rate limit"):
        // conviene guardarlo tal cual, es lo que va a leer el anfitrión.
        throw new Error(`resend ${r.status}: ${cuerpo?.message ?? cuerpo?.name ?? 'sin detalle'}`);
      }
      return cuerpo?.id ?? null;
    },
    cerrar: async () => {},
  };
}

async function porSmtp(): Promise<Cartero> {
  const host = Deno.env.get('SMTP_HOST');
  if (!host) throw new Error('falta el secret SMTP_HOST');
  const port = Number(Deno.env.get('SMTP_PORT') ?? 587);
  // 465 es TLS implícito; 587 arranca en claro y hace STARTTLS.
  const implicito = (Deno.env.get('SMTP_TLS') ?? (port === 465 ? 'implicit' : 'starttls')) === 'implicit';
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  const { from, nombre } = remitente();
  const replyTo = Deno.env.get('MAIL_REPLY_TO');

  const cliente = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: implicito,
      ...(user && pass ? { auth: { username: user, password: pass } } : {}),
    },
    // El buzón de pruebas local no habla TLS ni pide usuario.
    debug: { allowUnsecure: Deno.env.get('SMTP_INSEGURO') === 'true' },
  });

  return {
    async enviar(carta) {
      await cliente.send({
        // Objeto y no "Nombre <mail>": así el nombre no pasa por el parser de
        // direcciones de denomailer, que se atraganta con los signos de apertura.
        from: { mail: from, name: nombre },
        to: carta.para,
        ...(replyTo ? { replyTo } : {}),
        subject: carta.asunto,
        content: carta.texto,
        html: carta.html,
        headers: { 'Auto-Submitted': 'auto-generated' },
      });
      return null;
    },
    cerrar: () => cliente.close(),
  };
}

export function abrirCartero(): Promise<Cartero> {
  return (Deno.env.get('MAIL_PROVIDER') ?? 'resend') === 'smtp'
    ? porSmtp()
    : Promise.resolve(porResend());
}
