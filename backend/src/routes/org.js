import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { requireRole } from "../auth.js";
import { CURRENCIES } from "../services/currencies.js";
import { publicProxyUrl } from "../config.js";
import { encrypt } from "../services/crypto.js";

export const router = Router();

router.get("/org", (req, res) => {
  const o = db.prepare("SELECT * FROM organizations WHERE id = ?").get(req.user.org_id);
  res.json({ id: o.id, name: o.name, proxyUrl: publicProxyUrl() });
});

router.get("/currencies", (_req, res) => res.json({ ...CURRENCIES, updatedAt: new Date().toISOString() }));

const PROVIDERS = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "azure", name: "Azure" },
];
const keyView = (k) => ({ id: k.id, environment: k.environment, last4: k.last4 });

router.get("/providers", (req, res) => {
  const keys = db.prepare("SELECT * FROM provider_keys WHERE org_id = ? ORDER BY rowid").all(req.user.org_id);
  res.json(
    PROVIDERS.map((p) => {
      const mine = keys.filter((k) => k.provider_id === p.id).map(keyView);
      return { ...p, connected: mine.some((k) => k.environment === "production"), keys: mine };
    })
  );
});

router.post("/providers/:id/keys", requireRole("admin"), (req, res) => {
  if (!PROVIDERS.some((p) => p.id === req.params.id)) throw new HttpError(404, "notFound");
  const apiKey = String(req.body?.apiKey || "").trim();
  const environment = String(req.body?.environment || "production").trim();
  if (apiKey.length < 8 || !/^[a-z0-9_-]{1,32}$/i.test(environment)) throw new HttpError(400, "invalid");
  const id = `k${randomUUID().slice(0, 8)}`;
  // Novi ključ zamenjuje stari za isto okruženje.
  db.transaction(() => {
    db.prepare("DELETE FROM provider_keys WHERE org_id = ? AND provider_id = ? AND environment = ?").run(req.user.org_id, req.params.id, environment);
    db.prepare("INSERT INTO provider_keys (id, org_id, provider_id, environment, encrypted_key, last4) VALUES (?,?,?,?,?,?)").run(
      id, req.user.org_id, req.params.id, environment, encrypt(apiKey), apiKey.slice(-4)
    );
  })();
  res.status(201).json({ id, environment, last4: apiKey.slice(-4) });
});

router.delete("/providers/:id/keys/:keyId", requireRole("admin"), (req, res) => {
  if (!PROVIDERS.some((p) => p.id === req.params.id)) throw new HttpError(404, "notFound");
  db.prepare("DELETE FROM provider_keys WHERE id = ? AND provider_id = ? AND org_id = ?").run(req.params.keyId, req.params.id, req.user.org_id);
  res.status(204).end();
});

// Proxy radi u istom procesu kao API: "zdrav" je dok backend radi, a lastCallAt je poslednji zapis sa izvorom proxy.
router.get("/proxy/status", (req, res) => {
  const r = db.prepare("SELECT MAX(created_at) t FROM usage WHERE org_id = ? AND source = 'proxy'").get(req.user.org_id);
  res.json({ healthy: true, lastCallAt: r.t ? new Date(r.t).toISOString() : null });
});
