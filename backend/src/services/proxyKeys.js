import { createHash, randomBytes } from "node:crypto";
import { db } from "../db.js";

export const KEY_PREFIX = "tl_";
export const hashKey = (key) => createHash("sha256").update(key).digest("hex");
export const newProxyKey = () => `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;

/** Organizacija kojoj pripada proxy ključ (traži se po SHA-256 hešu), ili null. */
export function orgByProxyKey(key) {
  if (typeof key !== "string" || !key.startsWith(KEY_PREFIX) || key.length > 200) return null;
  return db.prepare("SELECT org_id FROM proxy_keys WHERE hash = ?").get(hashKey(key))?.org_id ?? null;
}
