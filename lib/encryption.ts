import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Authenticated encryption (AES-256-GCM) for Google refresh tokens.
 * SERVER-ONLY — never import from client components.
 *
 * TOKEN_ENCRYPTION_KEY must be 32 random bytes encoded as base64
 * (`openssl rand -base64 32`). The stored payload is:
 *   iv.base64.authTag.base64.ciphertext.base64
 */

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Missing TOKEN_ENCRYPTION_KEY");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must decode to 32 bytes (openssl rand -base64 32)"
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
