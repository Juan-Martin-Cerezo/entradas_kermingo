import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/tickets/validate/route';
import { db } from '@/lib/db';

// Mock the prisma database client
vi.mock('@/lib/db', () => ({
  db: {
    ticket: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('Tickets Validation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if ticket ID is missing', async () => {
    const req = new Request('http://localhost/api/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('El ID de la entrada es requerido.');
  });

  it('should return 404 if ticket does not exist', async () => {
    // updateMany returns count 0
    vi.mocked(db.ticket.updateMany).mockResolvedValue({ count: 0 });
    // findUnique returns null
    vi.mocked(db.ticket.findUnique).mockResolvedValue(null);

    const req = new Request('http://localhost/api/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({ ticketId: 'non-existent-uuid' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('TICKET NOT FOUND');
  });

  it('should return 400 with NO personal details if ticket was already used', async () => {
    vi.mocked(db.ticket.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(db.ticket.findUnique).mockResolvedValue({
      id: 'used-uuid',
      entry_status: true,
      entry_date: new Date('2026-05-25T10:00:00Z'),
      holder_name: 'Leaked Name',
      purchase_id: 'purchase-uuid',
    } as any);

    const req = new Request('http://localhost/api/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({ ticketId: 'used-uuid' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('TICKET ALREADY USED');
    expect(data.entryDate).toBeDefined();
    // Verify PII is hidden
    expect(data.holderName).toBeUndefined();
    expect(data.buyerEmail).toBeUndefined();
  });

  it('should return 200 with ticket details on successful check-in', async () => {
    // First updateMany succeeds (returns count 1)
    vi.mocked(db.ticket.updateMany).mockResolvedValue({ count: 1 });
    // Then findUnique returns ticket details
    vi.mocked(db.ticket.findUnique).mockResolvedValue({
      id: 'valid-uuid',
      entry_status: true,
      entry_date: new Date('2026-05-25T11:00:00Z'),
      holder_name: 'John Doe',
      purchase: {
        buyer_email: 'buyer@test.com',
      },
    } as any);

    const req = new Request('http://localhost/api/tickets/validate', {
      method: 'POST',
      body: JSON.stringify({ ticketId: 'valid-uuid' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.holderName).toBe('John Doe');
    expect(data.buyerEmail).toBe('buyer@test.com');
  });
});
