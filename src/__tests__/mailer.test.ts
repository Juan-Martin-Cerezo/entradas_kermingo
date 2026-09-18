import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: vi.fn(async (opts: unknown) => opts) })),
  },
}));

import { sendTicketsEmail, sendRejectionEmail, type EventBranding } from '@/lib/mailer';

const BRANDING: EventBranding = {
  name: 'Fiesta Tech 2026',
  contactEmail: 'hola@fiestatech.com',
  payAlias: 'fiesta.tech.mp',
  logoUrl: undefined,
};

describe('mailer templado por evento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_FROM = 'EventHub <noreply@eventhub.app>';
  });

  it('email de tickets sale con el nombre y alias del evento (no Demo)', async () => {
    const result = (await sendTicketsEmail('buyer@test.com', [
      { id: 't1', qrDataUrl: 'data:image/png;base64,AAAA', holderName: 'Juan Perez' },
    ], BRANDING)) as unknown as { subject: string; html: string; replyTo?: string };

    expect(result.subject).toContain('Fiesta Tech 2026');
    expect(result.subject).not.toMatch(/kermingo/i);
    expect(result.html).toContain('Fiesta Tech 2026');
    expect(result.html).toContain('Juan Perez');
    expect(result.html).not.toMatch(/kermingo/i);
    expect(result.html).not.toContain('evento.kermingo');
  });

  it('usa reply-to con el email de contacto del evento', async () => {
    const result = (await sendTicketsEmail('buyer@test.com', [
      { id: 't1', qrDataUrl: 'data:image/png;base64,AAAA', holderName: 'Juan' },
    ], BRANDING)) as unknown as { replyTo?: string };

    expect(result.replyTo).toBe('hola@fiestatech.com');
  });

  it('email de rechazo sale con nombre del evento y link al slug', async () => {
    const result = (await sendRejectionEmail(
      'buyer@test.com',
      2,
      'https://eventhub.app/fiesta-tech',
      BRANDING
    )) as unknown as { subject: string; html: string };

    expect(result.subject).toContain('Fiesta Tech 2026');
    expect(result.html).toContain('https://eventhub.app/fiesta-tech');
    expect(result.html).not.toMatch(/kermingo/i);
    expect(result.html).not.toContain('wa.me/541171540510');
  });

  it('escapa HTML en nombres de titulares', async () => {
    const result = (await sendTicketsEmail('buyer@test.com', [
      { id: 't1', qrDataUrl: 'data:image/png;base64,AAAA', holderName: '<script>alert(1)</script>' },
    ], BRANDING)) as unknown as { html: string };

    expect(result.html).not.toContain('<script>alert(1)</script>');
    expect(result.html).toContain('&lt;script&gt;');
  });
});
