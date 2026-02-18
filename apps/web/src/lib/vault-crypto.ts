import { WORDLIST } from './wordlist';

const PBKDF2_ITERATIONS = 600_000;
const VERIFICATION_PLAINTEXT = 'a4-vault-ok';

// Module-level key cache — lost on page refresh
let cachedKey: CryptoKey | null = null;

export function getCachedKey(): CryptoKey | null {
  return cachedKey;
}

export function setCachedKey(key: CryptoKey): void {
  cachedKey = key;
}

export function clearCachedKey(): void {
  cachedKey = null;
}

/** Generate a 16-byte random salt, returned as base64. */
export function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return uint8ToBase64(bytes);
}

/** Derive an AES-256-GCM key from a passphrase + base64 salt via PBKDF2-SHA256. */
export async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passphraseBytes = enc.encode(passphrase);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBytes.buffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToUint8(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt plaintext with AES-256-GCM. Returns base64 ciphertext + base64 IV. */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const enc = new TextEncoder();
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = enc.encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
    key,
    plaintextBytes.buffer as ArrayBuffer,
  );

  return {
    ciphertext: uint8ToBase64(new Uint8Array(encrypted)),
    iv: uint8ToBase64(ivBytes),
  };
}

/** Decrypt base64 ciphertext with AES-256-GCM. Throws on wrong key / tampered data. */
export async function decrypt(
  ciphertext: string,
  iv: string,
  key: CryptoKey,
): Promise<string> {
  const dec = new TextDecoder();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToUint8(iv) },
    key,
    base64ToUint8(ciphertext),
  );
  return dec.decode(decrypted);
}

/** Generate a 3-word passphrase from the wordlist. */
export function generatePassphrase(): string {
  const words: string[] = [];
  for (let i = 0; i < 3; i++) {
    const index = crypto.getRandomValues(new Uint32Array(1))[0]! % WORDLIST.length;
    words.push(WORDLIST[index]!);
  }
  return words.join(' ');
}

/** Encrypt the known verification string for vault setup. */
export async function encryptVerification(key: CryptoKey) {
  return encrypt(VERIFICATION_PLAINTEXT, key);
}

/** Verify a derived key by decrypting the stored verification ciphertext. */
export async function verifyKey(
  key: CryptoKey,
  verificationCiphertext: string,
  verificationIV: string,
): Promise<boolean> {
  try {
    const result = await decrypt(verificationCiphertext, verificationIV, key);
    return result === VERIFICATION_PLAINTEXT;
  } catch {
    return false;
  }
}

// --- base64 helpers ---

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}
