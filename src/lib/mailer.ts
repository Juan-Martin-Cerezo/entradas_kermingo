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

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendTicketsEmail(buyerEmail: string, tickets: TicketInfo[]) {
  const fromEmail = process.env.SMTP_FROM || '"Kermingo 2026" <noreply@kermingo.com>';

  const ticketHtmlList = tickets
    .map(
      (ticket, index) => `
    <div style="border: 3px solid #74ACDF; background-color: #ffffff; padding: 20px; margin: 15px 0; border-radius: 12px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <h3 style="color: #74ACDF; margin-top: 0; font-family: sans-serif; font-size: 1.2rem;">🇦🇷 ENTRADA KERMINGO 2026 🇦🇷</h3>
      <p style="font-size: 1.1rem; font-weight: bold; margin: 5px 0; font-family: sans-serif; color: #333333;">
        Titular: <span style="color: #D4AF37;">${escapeHtml(ticket.holderName)}</span>
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

export async function sendRejectionEmail(buyerEmail: string, quantity: number, siteUrl: string) {
  const fromEmail = process.env.SMTP_FROM || '"Kermingo 2026" <noreply@kermingo.com>';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Novedades sobre tus Entradas - Kermingo 2026</title>
      </head>
      <body style="background-color: #fcf3f3; margin: 0; padding: 20px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333333;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 2px solid #ff8080;">
          <!-- Header -->
          <div style="background-color: #ff8080; background-image: linear-gradient(135deg, #ff8080 0%, #ffb3b3 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 1.8rem; letter-spacing: 1px; font-family: sans-serif; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">
              ⚽ ¡KERMINGO 2026! ⚽
            </h1>
            <p style="color: #ffffff; margin: 5px 0 0 0; font-size: 1rem; font-family: sans-serif; opacity: 0.9;">
              Novedades sobre tu pedido
            </p>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px 20px;">
            <h2 style="color: #d9534f; font-family: sans-serif; margin-top: 0; font-size: 1.4rem;">Novedades sobre tu pedido</h2>
            <p style="font-size: 0.95rem; line-height: 1.5; color: #555555; font-family: sans-serif;">
              Te informamos que no hemos podido verificar el pago de tu pedido de <strong>${quantity} ${quantity === 1 ? 'entrada' : 'entradas'}</strong>. Por este motivo, la solicitud ha sido rechazada.
            </p>
            
            <div style="margin: 25px 0; font-family: sans-serif;">
              <!-- Option A: Didn't pay -->
              <div style="border-left: 4px solid #74ACDF; background-color: #f3f8fc; padding: 15px 20px; margin-bottom: 15px; border-radius: 0 12px 12px 0; text-align: left;">
                <h4 style="color: #437fb2; margin: 0 0 5px 0; font-size: 0.95rem; font-weight: bold;">Opción A: Completaste el formulario pero no realizaste el pago</h4>
                <p style="font-size: 0.85rem; line-height: 1.4; margin: 0 0 12px 0; color: #666666;">
                  Si llenaste el registro pero finalmente no hiciste la transferencia bancaria, podés volver a iniciar el proceso y generar un nuevo pedido.
                </p>
                <div style="text-align: left;">
                  <a href="${siteUrl}" style="display: inline-block; background-color: #74ACDF; color: #ffffff; text-decoration: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; font-size: 0.85rem; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                    🎟️ Hacer un nuevo pedido
                  </a>
                </div>
              </div>
              
              <!-- Option B: Paid but rejected -->
              <div style="border-left: 4px solid #25D366; background-color: #f2fbf5; padding: 15px 20px; border-radius: 0 12px 12px 0; text-align: left;">
                <h4 style="color: #1e7e34; margin: 0 0 5px 0; font-size: 0.95rem; font-weight: bold;">Opción B: Sí realizaste la transferencia</h4>
                <p style="font-size: 0.85rem; line-height: 1.4; margin: 0 0 12px 0; color: #666666;">
                  Si transferiste el dinero y creés que hubo un error en nuestra verificación, ponete en contacto directo con nosotros por WhatsApp para solucionarlo y emitir tus entradas de forma manual.
                </p>
                <div style="text-align: left;">
                  <a href="https://wa.me/541171540510" style="display: inline-block; background-color: #25D366; color: #ffffff; text-decoration: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; font-size: 0.85rem; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
                    💬 Hablar por WhatsApp
                  </a>
                </div>
              </div>
            </div>
            
            <p style="font-size: 0.85rem; line-height: 1.4; color: #888888; font-family: sans-serif; text-align: center; border-top: 1px solid #eeeeee; padding-top: 15px; margin-top: 25px;">
              Por favor, tené a mano tu comprobante de transferencia al comunicarte.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #fcf8f8; padding: 15px; text-align: center; border-top: 1px solid #eeeeee;">
            <p style="margin: 0; font-size: 0.8rem; color: #aaaaaa; font-family: sans-serif;">
              Kermingo 2026
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const mailOptions = {
    from: fromEmail,
    to: buyerEmail,
    subject: '⚽ Compra de Entradas Rechazada - Kermingo 2026 🇦🇷',
    html: htmlContent,
  };

  return transporter.sendMail(mailOptions);
}
