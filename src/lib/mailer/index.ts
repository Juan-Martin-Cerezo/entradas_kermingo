import nodemailer from 'nodemailer';
import { db } from '../db';
import { buildRejectionHtml, buildTicketsHtml, type EventBranding, type TicketInfo } from './templates';

export type { EventBranding, TicketInfo };

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '2525', 10),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const PLATFORM_FROM = '"EventHub" <noreply@eventhub.app>';

function resolveFrom(branding: EventBranding): string {
  if (process.env.SMTP_FROM) return process.env.SMTP_FROM;
  return `"${branding.name}" <noreply@eventhub.app>`;
}

function resolveReplyTo(branding: EventBranding): string | undefined {
  return branding.contactEmail ?? undefined;
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

  const mailOptions = {
    from: resolveFrom(resolved),
    replyTo: resolveReplyTo(resolved),
    to: buyerEmail,
    subject: `Tus Entradas para ${resolved.name}`,
    html: htmlContent,
    attachments: attachments,
  };

  return transporter.sendMail(mailOptions);
}

export async function sendRejectionEmail(
  buyerEmail: string,
  quantity: number,
  siteUrl: string,
  branding?: EventBranding
) {
  const resolved = branding ?? { name: 'tu evento' };
  const htmlContent = buildRejectionHtml(resolved, quantity, siteUrl);

  const mailOptions = {
    from: resolveFrom(resolved),
    replyTo: resolveReplyTo(resolved),
    to: buyerEmail,
    subject: `Compra de Entradas Rechazada - ${resolved.name}`,
    html: htmlContent,
  };

  return transporter.sendMail(mailOptions);
}

export { PLATFORM_FROM };
