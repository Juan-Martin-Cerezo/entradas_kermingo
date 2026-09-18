import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  uploadReceipt,
  deleteReceipt,
  getReceiptUrl,
  getStorageMode,
  createR2PresignedUrl,
  mockReceiptStore,
} from '@/lib/storage';

describe('Storage Module (F5)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    mockReceiptStore.clear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Storage Mode detection', () => {
    it('defaults to db mode when STORAGE_MODE is not set', () => {
      delete process.env.STORAGE_MODE;
      expect(getStorageMode()).toBe('db');
    });

    it('detects r2 mode', () => {
      process.env.STORAGE_MODE = 'r2';
      expect(getStorageMode()).toBe('r2');
    });

    it('detects blob mode', () => {
      process.env.STORAGE_MODE = 'blob';
      expect(getStorageMode()).toBe('blob');
    });

    it('detects mock mode', () => {
      process.env.STORAGE_MODE = 'mock';
      expect(getStorageMode()).toBe('mock');
    });
  });

  describe('DB fallback mode', () => {
    it('uploads receipt as base64 data URL', async () => {
      process.env.STORAGE_MODE = 'db';
      const fileBuffer = Buffer.from('fake-receipt-content');
      const result = await uploadReceipt({
        eventId: 'event-123',
        fileBuffer,
        mimeType: 'image/jpeg',
        filename: 'comprobante.jpg',
      });

      expect(result.mode).toBe('db');
      expect(result.url).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.key).toBe('db');

      // Decoding should match original buffer
      const base64Data = result.url.replace(/^data:image\/jpeg;base64,/, '');
      expect(Buffer.from(base64Data, 'base64').toString()).toBe('fake-receipt-content');
    });

    it('getReceiptUrl returns base64 url without modifications', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
      const resolved = await getReceiptUrl(dataUrl);
      expect(resolved).toBe(dataUrl);
    });

    it('deleteReceipt does not fail for data URL', async () => {
      await expect(deleteReceipt('data:image/png;base64,abc')).resolves.toBeUndefined();
    });
  });

  describe('Mock storage mode (Object Storage simulation)', () => {
    it('uploads to mock storage and does not start with data:', async () => {
      process.env.STORAGE_MODE = 'mock';
      const fileBuffer = Buffer.from('test-receipt-data');
      const result = await uploadReceipt({
        eventId: 'event-xyz',
        fileBuffer,
        mimeType: 'image/png',
        filename: 'ticket.png',
      });

      expect(result.mode).toBe('mock');
      expect(result.url).not.toMatch(/^data:/);
      expect(result.url).toContain('https://mock-storage.local/receipts/event-xyz/');
      expect(result.key).toContain('receipts/event-xyz/');
      expect(mockReceiptStore.has(result.key)).toBe(true);

      const stored = mockReceiptStore.get(result.key);
      expect(stored?.buffer.toString()).toBe('test-receipt-data');
      expect(stored?.mimeType).toBe('image/png');
    });

    it('deletes from mock storage when deleteReceipt is called', async () => {
      process.env.STORAGE_MODE = 'mock';
      const fileBuffer = Buffer.from('to-delete');
      const result = await uploadReceipt({
        eventId: 'event-del',
        fileBuffer,
        mimeType: 'application/pdf',
        filename: 'receipt.pdf',
      });

      expect(mockReceiptStore.has(result.key)).toBe(true);

      await deleteReceipt(result.url);
      expect(mockReceiptStore.has(result.key)).toBe(false);
    });
  });

  describe('R2 / S3 SigV4 presigned URL', () => {
    it('generates a valid AWS SigV4 presigned URL', () => {
      process.env.R2_ACCOUNT_ID = 'testaccount123';
      process.env.R2_BUCKET = 'test-bucket';
      process.env.R2_ACCESS_KEY_ID = 'test-access-key';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key-very-secure';
      process.env.R2_REGION = 'auto';

      const key = 'receipts/event-1/123-abc.jpg';
      const presignedUrl = createR2PresignedUrl(key, 3600);

      expect(presignedUrl).toContain('https://testaccount123.r2.cloudflarestorage.com/test-bucket/receipts/event-1/123-abc.jpg');
      expect(presignedUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(presignedUrl).toContain('X-Amz-Credential=test-access-key%2F');
      expect(presignedUrl).toContain('X-Amz-SignedHeaders=host');
      expect(presignedUrl).toContain('X-Amz-Signature=');
      expect(presignedUrl).toContain('X-Amz-Expires=3600');
    });

    it('uses R2_PUBLIC_URL if configured', () => {
      process.env.R2_ACCOUNT_ID = 'testaccount123';
      process.env.R2_BUCKET = 'test-bucket';
      process.env.R2_PUBLIC_URL = 'https://cdn.eventhub.app';

      const key = 'receipts/event-1/file.png';
      const url = createR2PresignedUrl(key);
      expect(url).toBe('https://cdn.eventhub.app/receipts/event-1/file.png');
    });

    it('resolves r2:// protocol URL via getReceiptUrl', async () => {
      process.env.R2_ACCOUNT_ID = 'testaccount123';
      process.env.R2_BUCKET = 'test-bucket';
      process.env.R2_ACCESS_KEY_ID = 'test-key';
      process.env.R2_SECRET_ACCESS_KEY = 'test-secret';

      const r2Url = 'r2://test-bucket/receipts/event-1/file.png';
      const viewable = await getReceiptUrl(r2Url);

      expect(viewable).toContain('https://testaccount123.r2.cloudflarestorage.com/test-bucket/receipts/event-1/file.png');
      expect(viewable).toContain('X-Amz-Signature=');
    });
  });
});
