import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function resolveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();

  if (raw) {
    if (/^[a-fA-F0-9]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }

    const base64Decoded = Buffer.from(raw, 'base64');
    if (base64Decoded.length === 32) {
      return base64Decoded;
    }
  }

  const fallback = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!fallback) {
    throw new Error(
      'Missing encryption key. Set ENCRYPTION_KEY (preferred) or AUTH_SECRET/NEXTAUTH_SECRET.',
    );
  }

  return createHash('sha256').update(fallback).digest();
}

export function encryptText(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptText(payload: string): string {
  const key = resolveKey();
  const parts = payload.split(':');

  if (parts.length !== 3) {
    return payload;
  }

  const [ivBase64, authTagBase64, ciphertextBase64] = parts;

  try {
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    return payload;
  }
}
