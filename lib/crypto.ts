import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

// Encrypts channel credentials (WhatsApp/email API tokens) at rest,
// per docs/BLUEPRINT.md. AES-256-GCM via Node's built-in crypto — no extra
// dependency needed. Key comes from CREDENTIALS_KEY (any passphrase string;
// scrypt derives a proper 32-byte key from it).
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const passphrase = process.env.CREDENTIALS_KEY;
  if (!passphrase) {
    throw new Error(
      "CREDENTIALS_KEY is not set — required to store channel credentials. " +
        "Generate one with: openssl rand -base64 32"
    );
  }
  return scryptSync(passphrase, "autobot-credentials", 32);
}

// Format: iv:authTag:ciphertext, all hex — stored as a single string column.
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(stored: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted value");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
