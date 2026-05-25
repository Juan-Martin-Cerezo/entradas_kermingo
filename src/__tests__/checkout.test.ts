import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/checkout/route';

// Mock the prisma database client
vi.mock('@/lib/db', () => ({
  db: {
    promoter: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    purchase: {
      create: vi.fn(),
    },
  },
}));

describe('Checkout API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if required fields are missing', async () => {
    const formData = new FormData();
    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Faltan campos requeridos.');
  });

  it('should return 400 if file is too large', async () => {
    const formData = new FormData();
    formData.append('email', 'test@test.com');
    formData.append('quantity', '1');
    formData.append('attendeeNames', JSON.stringify(['Test User']));
    
    // Create a mock file larger than 2MB (2.5MB)
    const largeFile = new File([new ArrayBuffer(2.5 * 1024 * 1024)], 'receipt.png', {
      type: 'image/png',
    });
    formData.append('receipt', largeFile);

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('El comprobante excede el tamaño máximo permitido de 2MB');
  });

  it('should return 400 if file type is invalid', async () => {
    const formData = new FormData();
    formData.append('email', 'test@test.com');
    formData.append('quantity', '1');
    formData.append('attendeeNames', JSON.stringify(['Test User']));
    
    const invalidFile = new File([new ArrayBuffer(100)], 'receipt.exe', {
      type: 'application/x-msdownload',
    });
    formData.append('receipt', invalidFile);

    const req = new Request('http://localhost/api/checkout', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Tipo de archivo no permitido');
  });
});
