import { decryptText, encryptText } from './aes';

export function encryptNullableText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  return encryptText(value);
}

export function decryptNullableText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  return decryptText(value);
}
