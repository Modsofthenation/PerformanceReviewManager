import { createHash, randomBytes, scryptSync } from "node:crypto";
import { encryptBytes } from "./store.js";

const MAGIC = Buffer.from("PRM1RB"); // Performance Review Manager v1 read-only bundle

/** Seal a JSON/HTML payload with a user-supplied passphrase (not the workspace vault key). */
export function sealReadonlyBundle(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const key = scryptSync(passphrase, Buffer.concat([Buffer.from("prm-readonly:"), salt]), 32);
  const enc = encryptBytes(plain, key);
  const checksum = createHash("sha256").update(plain).digest().subarray(0, 8);
  return Buffer.concat([MAGIC, salt, checksum, enc]);
}

export function readonlyBundleFilename(cycleName: string) {
  return `prm-readonly-${cycleName.replace(/\s+/g, "-").toLowerCase()}.prm.enc`;
}
