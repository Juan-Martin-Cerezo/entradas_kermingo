import crypto from 'crypto';

export type StorageMode = 'db' | 'r2' | 'blob' | 'mock';

export interface UploadReceiptOptions {
  eventId: string;
  fileBuffer: Buffer;
  mimeType: string;
  filename?: string;
}

export interface UploadReceiptResult {
  url: string;
  key: string;
  mode: StorageMode;
}

// In-memory store for 'mock' mode (used during testing)
export const mockReceiptStore = new Map<string, { buffer: Buffer; mimeType: string; eventId: string }>();

export function getStorageMode(): StorageMode {
  const envMode = (process.env.STORAGE_MODE || '').toLowerCase();
  if (envMode === 'mock') return 'mock';
  if (envMode === 'r2') return 'r2';
  if (envMode === 'blob') return 'blob';
  return 'db';
}

function sanitizeExtension(filename?: string, mimeType?: string): string {
  if (filename && filename.includes('.')) {
    const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ext && ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext)) {
      return ext;
    }
  }
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'bin';
}

function generateReceiptKey(eventId: string, filename?: string, mimeType?: string): string {
  const ext = sanitizeExtension(filename, mimeType);
  const random = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  return `receipts/${eventId}/${timestamp}-${random}.${ext}`;
}

// AWS SigV4 helpers
function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const bucket = process.env.R2_BUCKET || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const region = process.env.R2_REGION || 'auto';
  const customEndpoint = process.env.R2_ENDPOINT;
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '');

  const host = customEndpoint 
    ? new URL(customEndpoint).host 
    : `${accountId}.r2.cloudflarestorage.com`;

  return { accountId, bucket, accessKeyId, secretAccessKey, region, host, publicUrl };
}

/**
 * Signs a URL for reading an object from R2 / S3
 */
export function createR2PresignedUrl(key: string, expiresInSeconds = 3600): string {
  const { bucket, accessKeyId, secretAccessKey, region, host, publicUrl } = getR2Config();

  if (publicUrl) {
    return `${publicUrl}/${key}`;
  }

  if (!accessKeyId || !secretAccessKey || !bucket) {
    return `https://${host}/${bucket}/${key}`;
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  const cleanKey = key.startsWith('/') ? key.substring(1) : key;
  const canonicalUri = `/${bucket}/${cleanKey}`;

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, 's3');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/**
 * Uploads a receipt according to configured STORAGE_MODE
 */
export async function uploadReceipt(options: UploadReceiptOptions): Promise<UploadReceiptResult> {
  const mode = getStorageMode();
  const { eventId, fileBuffer, mimeType, filename } = options;

  if (mode === 'mock') {
    const key = generateReceiptKey(eventId, filename, mimeType);
    mockReceiptStore.set(key, { buffer: fileBuffer, mimeType, eventId });
    return {
      url: `https://mock-storage.local/${key}`,
      key,
      mode: 'mock',
    };
  }

  if (mode === 'r2') {
    const { bucket, accessKeyId, secretAccessKey, region, host, publicUrl } = getR2Config();
    if (!accessKeyId || !secretAccessKey || !bucket) {
      console.warn('R2 storage mode configured but credentials missing. Falling back to DB mode.');
      return uploadDbFallback(fileBuffer, mimeType);
    }

    const key = generateReceiptKey(eventId, filename, mimeType);
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

    const canonicalUri = `/${bucket}/${cleanKey}`;
    const payloadHash = sha256(fileBuffer);
    const canonicalHeaders = `content-type:${mimeType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(secretAccessKey, dateStamp, region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const putRes = await fetch(`https://${host}${canonicalUri}`, {
      method: 'PUT',
      headers: {
        'content-type': mimeType,
        'host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'authorization': authHeader,
      },
      body: new Uint8Array(fileBuffer),
    });

    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => '');
      throw new Error(`Error uploading receipt to R2 (${putRes.status}): ${errText}`);
    }

    const storedUrl = publicUrl ? `${publicUrl}/${cleanKey}` : `r2://${bucket}/${cleanKey}`;
    return {
      url: storedUrl,
      key: cleanKey,
      mode: 'r2',
    };
  }

  if (mode === 'blob') {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.warn('Vercel Blob storage mode configured but BLOB_READ_WRITE_TOKEN is missing. Falling back to DB mode.');
      return uploadDbFallback(fileBuffer, mimeType);
    }

    const key = generateReceiptKey(eventId, filename, mimeType);
    const uploadRes = await fetch(`https://blob.vercel-storage.com/${key}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-version': '7',
        'content-type': mimeType,
      },
      body: new Uint8Array(fileBuffer),
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '');
      throw new Error(`Error uploading receipt to Vercel Blob (${uploadRes.status}): ${errText}`);
    }

    const data = await uploadRes.json() as { url: string; pathname?: string };
    return {
      url: data.url,
      key: data.pathname || key,
      mode: 'blob',
    };
  }

  // Default: 'db' mode
  return uploadDbFallback(fileBuffer, mimeType);
}

function uploadDbFallback(fileBuffer: Buffer, mimeType: string): UploadReceiptResult {
  const base64 = fileBuffer.toString('base64');
  const safeMime = mimeType || 'application/octet-stream';
  return {
    url: `data:${safeMime};base64,${base64}`,
    key: 'db',
    mode: 'db',
  };
}

/**
 * Deletes a receipt from storage if stored externally
 */
export async function deleteReceipt(receiptUrlOrKey: string): Promise<void> {
  if (!receiptUrlOrKey || receiptUrlOrKey.startsWith('data:')) {
    return;
  }

  const mode = getStorageMode();

  // Mock mode deletion
  if (mode === 'mock' || receiptUrlOrKey.includes('mock-storage.local')) {
    for (const [key] of mockReceiptStore.entries()) {
      if (receiptUrlOrKey.includes(key) || key === receiptUrlOrKey) {
        mockReceiptStore.delete(key);
      }
    }
    return;
  }

  // R2 deletion
  if (receiptUrlOrKey.startsWith('r2://') || mode === 'r2') {
    const { bucket, accessKeyId, secretAccessKey, region, host } = getR2Config();
    if (!accessKeyId || !secretAccessKey || !bucket) return;

    let key = receiptUrlOrKey;
    if (key.startsWith('r2://')) {
      const parts = key.replace('r2://', '').split('/');
      parts.shift(); // remove bucket
      key = parts.join('/');
    } else if (key.startsWith('http://') || key.startsWith('https://')) {
      const url = new URL(key);
      key = url.pathname.replace(`/${bucket}/`, '').replace(/^\//, '');
    }

    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

    const canonicalUri = `/${bucket}/${cleanKey}`;
    const payloadHash = sha256('');
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      'DELETE',
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256(canonicalRequest),
    ].join('\n');

    const signingKey = getSigningKey(secretAccessKey, dateStamp, region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    try {
      await fetch(`https://${host}${canonicalUri}`, {
        method: 'DELETE',
        headers: {
          'host': host,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
          'authorization': authHeader,
        },
      });
    } catch (err) {
      console.error('Error deleting object from R2:', err);
    }
    return;
  }

  // Blob deletion
  if (receiptUrlOrKey.includes('blob.vercel-storage.com') || mode === 'blob') {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return;

    try {
      await fetch('https://blob.vercel-storage.com/delete', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ urls: [receiptUrlOrKey] }),
      });
    } catch (err) {
      console.error('Error deleting object from Vercel Blob:', err);
    }
  }
}

/**
 * Returns a viewable URL for the owner (signed URL for private R2/S3, or direct URL)
 */
export async function getReceiptUrl(receiptUrlOrKey: string): Promise<string> {
  if (!receiptUrlOrKey) return '';
  if (receiptUrlOrKey.startsWith('data:')) return receiptUrlOrKey;

  // If stored in R2 protocol: r2://bucket/key
  if (receiptUrlOrKey.startsWith('r2://')) {
    const parts = receiptUrlOrKey.replace('r2://', '').split('/');
    parts.shift(); // bucket name
    const key = parts.join('/');
    return createR2PresignedUrl(key);
  }

  // If stored as full R2 storage host URL and no public domain
  const { host, publicUrl } = getR2Config();
  if (host && receiptUrlOrKey.includes(host) && !publicUrl) {
    try {
      const url = new URL(receiptUrlOrKey);
      const parts = url.pathname.replace(/^\//, '').split('/');
      parts.shift(); // remove bucket
      const key = parts.join('/');
      return createR2PresignedUrl(key);
    } catch {
      return receiptUrlOrKey;
    }
  }

  return receiptUrlOrKey;
}
