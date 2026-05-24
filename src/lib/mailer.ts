import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT || '2525', 10),
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

interface TicketInfo {
  id: string;
  qrDataUrl: string;
  holderName: string;
}

export async function sendTicketsEmail(buyerEmail: string, tickets: TicketInfo[]) {
  const fromEmail = process.env.SMTP_FROM || '"Kermingo 2026" <noreply@kermingo.com>';

  const ticketHtmlList = tickets
    .map(
      (ticket, index) => `
    <div style="border: 3px solid #74ACDF; background-color: #ffffff; padding: 20px; margin: 15px 0; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <h3 style="color: #74ACDF; margin-top: 0; font-family: sans-serif; font-size: 1.2rem;">🇦🇷 ENTRADA KERMINGO 2026 🇦🇷</h3>
      <p style="font-size: 1.1rem; font-weight: bold; margin: 5px 0; font-family: sans-serif; color: #333333;">
        Titular: <span style="color: #D4AF37;">${ticket.holderName}</span>
      </p>
      <p style="font-size: 0.9rem; margin: 2px 0; font-family: sans-serif; color: #666666;">Ticket #${index + 1} de ${tickets.length}</p>
      <div style="margin: 15px 0;">
        <img src="cid:qr-${ticket.id}" alt="QR Code Ticket #${index + 1}" style="width: 200px; height: 200px; border: 4px solid #D4AF37; border-radius: 8px;" />
      </div>
      <p style="font-family: monospace; font-size: 11px; color: #777777; margin-bottom: 0; word-break: break-all;">
        ID: ${ticket.id}
      </p>
    </div>
  `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Tus Entradas para Kermingo 2026</title>
      </head>
      <body style="background-color: #f3f8fc; margin: 0; padding: 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 2px solid #74ACDF;">
          <!-- Header -->
          <div style="background-color: #74ACDF; background-image: linear-gradient(135deg, #74ACDF 0%, #a5d3f7 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 1.8rem; letter-spacing: 1px; font-family: sans-serif; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">
              ⚽ ¡KERMINGO 2026! ⚽
            </h1>
            <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 1rem; font-family: sans-serif; opacity: 0.9;">
              20 de Junio - Estomba 1942
            </p>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px 20px;">
            <h2 style="color: #333333; font-family: sans-serif; margin-top: 0;">¡Gracias por tu compra!</h2>
            <p style="font-size: 1rem; line-height: 1.5; color: #555555; font-family: sans-serif;">
              Tu transferencia ha sido verificada y tus entradas han sido emitidas con éxito. A continuación, encontrarás tus códigos QR correspondientes a cada titular.
            </p>
            
            <div style="margin: 20px 0;">
              ${ticketHtmlList}
            </div>
            
            <p style="font-size: 0.9rem; line-height: 1.4; color: #666666; font-family: sans-serif; text-align: center; border-top: 1px solid #eeeeee; padding-top: 20px; margin-top: 30px;">
              ⚠️ <strong>Importante:</strong> Presentá estos códigos QR en la puerta desde tu celular para registrar el ingreso. Cada QR es de un único uso y está asociado a su titular.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f7fafc; padding: 15px; text-align: center; border-top: 1px solid #eeeeee;">
            <p style="margin: 0; font-size: 0.8rem; color: #aaaaaa; font-family: sans-serif;">
              Kermingo 2026
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const attachments = tickets.map((t, index) => {
    const base64Data = t.qrDataUrl.split(',')[1];
    return {
      filename: `ticket-${index + 1}.png`,
      content: Buffer.from(base64Data, 'base64'),
      cid: `qr-${t.id}`,
    };
  });

  const mailOptions = {
    from: fromEmail,
    to: buyerEmail,
    subject: '⚽ Tus Entradas para Kermingo 2026 🇦🇷',
    html: htmlContent,
    attachments: attachments,
  };

  return transporter.sendMail(mailOptions);
}
