export interface ScannerStorageKeys {
  offlineDb: string;
  pendingSync: string;
}

export const LEGACY_OFFLINE_DB_KEY = 'kermingo_offline_db';
export const LEGACY_PENDING_SYNC_KEY = 'kermingo_pending_sync';

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function scannerStorageKeys(slug: string): ScannerStorageKeys {
  const safe = normalizeSlug(slug);
  return {
    offlineDb: `eh_${safe}_offline_db`,
    pendingSync: `eh_${safe}_pending_sync`,
  };
}

export interface OfflineTicket {
  id: string;
  eventId?: string;
  entryStatus?: boolean;
  [key: string]: unknown;
}

export function isTicketFromAnotherEvent(ticket: OfflineTicket, eventId: string): boolean {
  if (!ticket.eventId) return false;
  return ticket.eventId !== eventId;
}

export function stampOfflineDb<T extends object>(tickets: T[], eventId: string): (T & { eventId: string })[] {
  return tickets.map((t) => ({ ...t, eventId }));
}

export function migrateLegacyStorage(
  read: (key: string) => string | null,
  write: (key: string, value: string) => void,
  remove: (key: string) => void,
  slug: string
): void {
  const keys = scannerStorageKeys(slug);
  const pairs: Array<[string, string]> = [
    [LEGACY_OFFLINE_DB_KEY, keys.offlineDb],
    [LEGACY_PENDING_SYNC_KEY, keys.pendingSync],
  ];
  for (const [legacyKey, newKey] of pairs) {
    if (read(newKey) !== null) continue;
    const legacyValue = read(legacyKey);
    if (legacyValue !== null) {
      write(newKey, legacyValue);
      remove(legacyKey);
    }
  }
}
