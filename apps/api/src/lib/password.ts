import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const PREFIX = "scrypt";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${PREFIX}:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith(`${PREFIX}:`)) {
    const [, salt, key] = storedHash.split(":");
    if (!salt || !key) {
      return false;
    }

    const storedKey = Buffer.from(key, "hex");
    const derivedKey = (await scrypt(password, salt, storedKey.length)) as Buffer;

    return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
  }

  const legacyHash = createHash("sha256").update(password).digest("hex");
  const legacyStored = Buffer.from(storedHash);
  const legacyCandidate = Buffer.from(legacyHash);

  return (
    legacyStored.length === legacyCandidate.length && timingSafeEqual(legacyStored, legacyCandidate)
  );
}

export function isLegacyPasswordHash(storedHash: string) {
  return !storedHash.startsWith(`${PREFIX}:`);
}
