// Shared crypto helpers for encrypting/decrypting stored gym credentials.
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Convert raw bytes to base64 for storage in DB fields.
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

// Parse base64 back into raw bytes for AES-GCM operations.
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Load and validate the AES key from env (must be 32 bytes for AES-256-GCM).
async function getKey(): Promise<CryptoKey> {
  const keyBase64 = Deno.env.get('ENCRYPTION_KEY');
  if (!keyBase64) {
    throw new Error('ENCRYPTION_KEY secret is not configured');
  }
  const raw = base64ToBytes(keyBase64);
  if (raw.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes base64-encoded');
  }
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Encrypt plaintext and return base64 of [12B IV | ciphertext].
export async function encryptString(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

// Decrypt base64 payload; reject if too short to include IV.
export async function decryptString(payload: string): Promise<string> {
  const key = await getKey();
  const data = base64ToBytes(payload);
  if (data.length <= 12) {
    throw new Error('Encrypted payload is invalid');
  }
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return textDecoder.decode(plaintext);
}
