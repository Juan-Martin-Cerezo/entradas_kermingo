import nodemailer from 'nodemailer';
import { db } from '../db';
import { buildRejectionHtml, buildTicketsHtml, buildInviteHtml, buildVerificationHtml, type EventBranding, type TicketInfo } from './templates';

export type { EventBranding, TicketInfo };

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);

// Sin timeouts, un SMTP que no responde deja el request colgado y el mail "no llega" sin error.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // 465 = TLS directo; 587 = STARTTLS
  requireTLS: SMTP_PORT === 587,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  pool: true,
  maxConnections: 2,
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

/**
 * Dirección remitente. Regla de oro anti-spam: NUNCA inventar un dominio que no
 * tengas verificado — mandar como `noreply@dominio-inexistente` termina en spam o
 * rechazado. Orden: MAIL_FROM_ADDRESS > MAIL_FROM > SMTP_FROM > usuario autenticado.
 */
function senderAddress(): string {
  const explicit = process.env.MAIL_FROM_ADDRESS || process.env.MAIL_FROM || process.env.SMTP_FROM || '';
  const angle = explicit.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  if (explicit.includes('@')) return explicit.trim();
  const user = process.env.SMTP_USER || '';
  return user.includes('@') ? user : 'no-responder@localhost';
}

function withDisplayName(name: string, address = senderAddress()): string {
  const clean = (name || 'EventHub').replace(/["<>]/g, '').trim().slice(0, 60) || 'EventHub';
  return `"${clean}" <${address}>`;
}

const PLATFORM_FROM = withDisplayName('EventHub');

function resolveFrom(branding: EventBranding): string {
  return withDisplayName(branding?.name || 'EventHub');
}

function resolveReplyTo(branding: EventBranding): string | undefined {
  return branding.contactEmail ?? process.env.MAIL_REPLY_TO ?? undefined;
}

/** Alternativa en texto plano: los filtros penalizan el HTML-only. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function headersFor(branding: EventBranding) {
  const reply = resolveReplyTo(branding);
  return {
    'Auto-Submitted': 'auto-generated',
    ...(reply ? { 'List-Unsubscribe': `<mailto:${reply}?subject=unsubscribe>` } : {}),
  } as Record<string, string>;
}

async function send(payload: nodemailer.SendMailOptions, label: string) {
  try {
    const info = await transporter.sendMail(payload);
    console.log(`[mailer] ${label} ok →`, info.messageId, 'aceptados:', info.accepted);
    return info;
  } catch (error) {
    const e = error as { code?: string; response?: string; command?: string; message?: string };
    console.error(`[mailer] ${label} FALLÓ code=${e.code} command=${e.command} response=${e.response} :: ${e.message}`);
    throw error;
  }
}

/** Verifica conexión y credenciales SMTP (usado por /api/admin/test-email). */
export async function verifyMailer() {
  await transporter.verify();
  return { host: process.env.SMTP_HOST, port: SMTP_PORT, from: PLATFORM_FROM, user: process.env.SMTP_USER };
}

export async function getEventBranding(eventId: string): Promise<EventBranding> {
  try {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: {
        name: true,
        config: {
          select: {
            contact_email: true,
            pay_alias: true,
            logo_url: true,
          },
        },
      },
    });
    if (!event) return { name: 'tu evento' };
    return {
      name: event.name,
      contactEmail: event.config?.contact_email,
      payAlias: event.config?.pay_alias,
      logoUrl: event.config?.logo_url,
    };
  } catch {
    return { name: 'tu evento' };
  }
}

export async function sendTicketsEmail(
  buyerEmail: string,
  tickets: TicketInfo[],
  branding?: EventBranding
) {
  const resolved = branding ?? { name: 'tu evento' };
  const htmlContent = buildTicketsHtml(resolved, tickets);

  const attachments = tickets.map((t, index) => {
    const base64Data = t.qrDataUrl.split(',')[1];
    return {
      filename: `ticket-${index + 1}.png`,
      content: Buffer.from(base64Data, 'base64'),
      cid: `qr-${t.id}`,
    };
  });

  return send({
    from: resolveFrom(resolved),
    replyTo: resolveReplyTo(resolved),
    to: buyerEmail,
    subject: `Tus entradas para ${resolved.name}`,
    text: htmlToText(htmlContent),
    html: htmlContent,
    headers: headersFor(resolved),
    attachments,
  }, 'sendTicketsEmail');
}

export async function sendRejectionEmail(
  buyerEmail: string,
  quantity: number,
  siteUrl: string,
  branding?: EventBranding
) {
  const resolved = branding ?? { name: 'tu evento' };
  const htmlContent = buildRejectionHtml(resolved, quantity, siteUrl);

  return send({
    from: resolveFrom(resolved),
    replyTo: resolveReplyTo(resolved),
    to: buyerEmail,
    subject: `Compra de entradas rechazada — ${resolved.name}`,
    text: htmlToText(htmlContent),
    html: htmlContent,
    headers: headersFor(resolved),
  }, 'sendRejectionEmail');
}

export async function sendInviteEmail(
  ownerEmail: string,
  eventName: string,
  inviteUrl: string
) {
  const htmlContent = buildInviteHtml(eventName, inviteUrl);

  return send({
    from: PLATFORM_FROM,
    replyTo: resolveReplyTo({ name: eventName, contactEmail: process.env.MAIL_REPLY_TO }),
    to: ownerEmail,
    subject: `Invitación para administrar ${eventName} en EventHub`,
    text: htmlToText(htmlContent),
    html: htmlContent,
    headers: headersFor({ name: eventName, contactEmail: process.env.MAIL_REPLY_TO }),
  }, 'sendInviteEmail');
}

export async function sendVerificationEmail(
  ownerEmail: string,
  eventName: string,
  verifyUrl: string
) {
  const htmlContent = buildVerificationHtml(eventName, verifyUrl);

  return send({
    from: PLATFORM_FROM,
    replyTo: resolveReplyTo({ name: eventName, contactEmail: process.env.MAIL_REPLY_TO }),
    to: ownerEmail,
    subject: `Verificá tu cuenta de EventHub — ${eventName}`,
    text: htmlToText(htmlContent),
    html: htmlContent,
    headers: headersFor({ name: eventName, contactEmail: process.env.MAIL_REPLY_TO }),
  }, 'sendVerificationEmail');
}

export { PLATFORM_FROM, transporter };
