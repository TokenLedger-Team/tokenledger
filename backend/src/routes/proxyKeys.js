import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { requireRole } from "../auth.js";
import { hashKey, newProxyKey } from "../services/proxyKeys.js";

export const router = Router();

const view = (k) => ({ id: k.id, name: k.name, last4: k.last4, createdAt: k.created_at });

router.get("/proxy-keys", requireRole("admin"), (req, res) => {
  res.json(db.prepare("SELECT * FROM proxy_keys WHERE org_id = ? ORDER BY rowid").all(req.user.org_id).map(view));
});

// Pun ključ se vraća samo ovde, jednom; u bazi ostaje samo heš.
router.post("/proxy-keys", requireRole("admin"), (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name || name.length > 80) throw new HttpError(400, "invalid");
  const key = newProxyKey();
  const id = `pk${randomUUID().slice(0, 8)}`;
  db.prepare("INSERT INTO proxy_keys (id, org_id, name, hash, last4) VALUES (?,?,?,?,?)").run(id, req.user.org_id, name, hashKey(key), key.slice(-4));
  res.status(201).json({ ...view(db.prepare("SELECT * FROM proxy_keys WHERE id = ?").get(id)), key });
});

router.delete("/proxy-keys/:id", requireRole("admin"), (req, res) => {
  db.prepare("DELETE FROM proxy_keys WHERE id = ? AND org_id = ?").run(req.params.id, req.user.org_id);
  res.status(204).end();
});
