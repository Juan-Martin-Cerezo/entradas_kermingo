import { describe, it, expect } from 'vitest';
import {
  scannerStorageKeys,
  isTicketFromAnotherEvent,
  stampOfflineDb,
  migrateLegacyStorage,
  LEGACY_OFFLINE_DB_KEY,
  LEGACY_PENDING_SYNC_KEY,
} from '@/lib/scanner-storage';

describe('scanner storage scoped por slug', () => {
  it('genera claves con prefijo eh_<slug>_ y no usa las legacy globales', () => {
    const keys = scannerStorageKeys('kermingo-2026');
    expect(keys.offlineDb).toBe('eh_kermingo-2026_offline_db');
    expect(keys.pendingSync).toBe('eh_kermingo-2026_pending_sync');
    expect(keys.offlineDb).not.toBe(LEGACY_OFFLINE_DB_KEY);
    expect(keys.pendingSync).not.toBe(LEGACY_PENDING_SYNC_KEY);
  });

  it('dos slugs distintos no comparten claves (no se pisan en el mismo celular)', () => {
    const a = scannerStorageKeys('evento-a');
    const b = scannerStorageKeys('evento-b');
    expect(a.offlineDb).not.toBe(b.offlineDb);
    expect(a.pendingSync).not.toBe(b.pendingSync);
  });

  it('normaliza el slug (trim + lowercase)', () => {
    expect(scannerStorageKeys('  Kermingo-2026 ').offlineDb).toBe('eh_kermingo-2026_offline_db');
  });

  it('detecta ticket offline de otro evento para RECHAZARLO', () => {
    expect(isTicketFromAnotherEvent({ id: 't1', eventId: 'event-a' }, 'event-a')).toBe(false);
    expect(isTicketFromAnotherEvent({ id: 't1', eventId: 'event-a' }, 'event-b')).toBe(true);
    expect(isTicketFromAnotherEvent({ id: 't1' }, 'event-b')).toBe(false);
  });

  it('stampOfflineDb marca cada ticket con su eventId', () => {
    const stamped = stampOfflineDb([{ id: 't1' }, { id: 't2' }], 'event-a');
    expect(stamped).toEqual([
      { id: 't1', eventId: 'event-a' },
      { id: 't2', eventId: 'event-a' },
    ]);
  });

  it('migra claves legacy a las scoped una sola vez', () => {
    const store = new Map<string, string>([
      [LEGACY_OFFLINE_DB_KEY, '[{"id":"t1"}]'],
      [LEGACY_PENDING_SYNC_KEY, '["t1"]'],
    ]);
    migrateLegacyStorage(
      (k) => store.get(k) ?? null,
      (k, v) => void store.set(k, v),
      (k) => void store.delete(k),
      'kermingo-2026'
    );
    expect(store.get('eh_kermingo-2026_offline_db')).toBe('[{"id":"t1"}]');
    expect(store.get('eh_kermingo-2026_pending_sync')).toBe('["t1"]');
    expect(store.has(LEGACY_OFFLINE_DB_KEY)).toBe(false);
    expect(store.has(LEGACY_PENDING_SYNC_KEY)).toBe(false);
  });

  it('no pisa la base scoped si ya existe', () => {
    const store = new Map<string, string>([
      [LEGACY_OFFLINE_DB_KEY, '[{"id":"old"}]'],
      ['eh_kermingo-2026_offline_db', '[{"id":"new"}]'],
    ]);
    migrateLegacyStorage(
      (k) => store.get(k) ?? null,
      (k, v) => void store.set(k, v),
      (k) => void store.delete(k),
      'kermingo-2026'
    );
    expect(store.get('eh_kermingo-2026_offline_db')).toBe('[{"id":"new"}]');
  });
});
