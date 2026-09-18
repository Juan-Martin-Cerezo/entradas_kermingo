import { NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { PLATFORM_FROM, transporter, verifyMailer } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

/**
 * Diagnóstico de envío de mails (solo superadmin).
 * POST { "to": "tu@mail.com" } → verifica conexión SMTP, manda un mail real y devuelve
 * la respuesta del servidor. Sirve para distinguir los tres casos:
 *   - error de conexión/auth  → llega `error.code` (EAUTH, ETIMEDOUT, ESOCKET…)
 *   - aceptado por el servidor → `accepted` con el destinatario (si no aparece en la
 *     bandeja de entrada, es entregabilidad: SPF/DKIM/DMARC o reputación, ver docs/email-deliverability.md)
 */
export async function POST(req: Request) {
  const isAuthorized = await checkAuth(undefined, ['superadmin']);
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { to?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const to = (body.to || '').trim();
  if (!to.includes('@')) {
    return NextResponse.json({ error: 'Pasá "to" con un email válido.' }, { status: 400 });
  }

  const config = {
    smtp_host: process.env.SMTP_HOST ? 'set' : 'FALTA',
    smtp_port: process.env.SMTP_PORT || '(default 587)',
    smtp_user: process.env.SMTP_USER || '(vacío)',
    smtp_from: process.env.SMTP_FROM || '(vacío)',
    mail_from: process.env.MAIL_FROM || '(vacío)',
    mail_from_address: process.env.MAIL_FROM_ADDRESS || '(vacío)',
    enviando_como: PLATFORM_FROM,
  };

  try {
    const verified = await verifyMailer();
    const info = await transporter.sendMail({
      from: PLATFORM_FROM,
      to,
      subject: 'Prueba de envío — EventHub',
      text: 'Si estás leyendo esto, el SMTP de EventHub funciona. Si llegó a spam, el problema es de entregabilidad (dominio/SPF/DKIM), no de configuración.',
      html: '<h2>Prueba de envío — EventHub</h2><p>Si estás leyendo esto, el SMTP funciona.</p><p><strong>Si llegó a spam</strong>, el problema es de entregabilidad del dominio (SPF/DKIM/DMARC), no de configuración SMTP. Ver <code>docs/email-deliverability.md</code>.</p>',
    });
    return NextResponse.json({
      ok: true,
      config,
      verified,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
      messageId: info.messageId,
      siguiente_paso: 'Revisá la bandeja Y la carpeta de spam. Si no llegó en 5 min, mirá `response` y el log de la función.',
    });
  } catch (error) {
    const e = error as { code?: string; response?: string; command?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        config,
        error: { code: e.code, command: e.command, response: e.response, message: e.message },
        pistas: pistas(e.code),
      },
      { status: 502 }
    );
  }
}

function pistas(code?: string): string {
  switch (code) {
    case 'EAUTH':
      return 'Usuario/contraseña SMTP rechazados. Si es Gmail, hace falta una App Password (no la contraseña normal) y 2FA activo.';
    case 'ETIMEDOUT':
    case 'ESOCKET':
    case 'ECONNECTION':
      return 'No se pudo conectar: revisá SMTP_HOST/SMTP_PORT (587 con STARTTLS, 465 con TLS directo) y que el proveedor no bloquee la IP de Vercel.';
    case 'EENVELOPE':
      return 'El servidor rechazó el remitente o el destinatario: el from debe ser del dominio/cuenta autenticada (no inventar dominios).';
    case 'E450':
    case 'E550':
      return 'Rechazo del servidor destino: típico de remitente no verificado (SPF/DKIM) o IP con mala reputación.';
    default:
      return 'Revisá el log de la función en Vercel: el mailer loguea code/command/response de cada envío.';
  }
}
