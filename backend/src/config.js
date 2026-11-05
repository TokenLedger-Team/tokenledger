import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  port: Number(process.env.PORT) || 8000,
  jwtSecret: process.env.JWT_SECRET || "",
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5500,http://127.0.0.1:5500").split(",").map((s) => s.trim()).filter(Boolean),
  dbPath: process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(root, "data", "tokenledger.db"),
  keySecret: process.env.KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET || "",
  // Javna adresa backenda; proxyUrl se sastavlja od nje (vidi publicProxyUrl).
  publicUrl: process.env.PUBLIC_URL || "http://localhost:8000",
  // Upstream adrese proxyja. Menjaju se samo kroz env (testovi), nikad iz zahteva.
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/+$/, ""),
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, ""),
  seedPassword: process.env.SEED_PASSWORD || "demo",
};

export function requireSecrets() {
  if (config.jwtSecret.length < 16) {
    throw new Error("JWT_SECRET nije podešen (min. 16 znakova). Kopiraj .env.example u .env i popuni ga.");
  }
}

/** Adresa koju aplikacija koristi kao base_url (PUBLIC_URL + /api/proxy). */
export function publicProxyUrl() {
  const base = config.publicUrl.replace(/\/+$/, "");
  return /\/api\/proxy$/.test(base) ? base : `${base}/api/proxy`;
}
