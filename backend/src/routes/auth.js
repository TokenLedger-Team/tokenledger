import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db, tx } from "../db.js";
import { HttpError } from "../i18n.js";
import { authenticate, revokeToken, signToken } from "../auth.js";
import { userView } from "../services/catalog.js";
import { createOrganization } from "../services/organizations.js";

export const publicAuth = Router();
export const privateAuth = Router();

// Poređenje sa lažnim hešom kad nalog ne postoji, da vreme odgovora ne otkriva postojanje naloga.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

publicAuth.post("/login", (req, res) => {
  const email = String(req.body?.email || "").trim();
  const password = String(req.body?.password || "");
  const user = email ? db.prepare("SELECT * FROM users WHERE email = ?").get(email) : null;
  const ok = bcrypt.compareSync(password, user?.password_hash || DUMMY_HASH);
  if (!user || !user.password_hash || !password || !ok) throw new HttpError(401, "login");
  res.json({ token: signToken(user, !!req.body?.remember), user: userView(user) });
});

// Nova firma: pravi se organizacija sa katalogom modela, a korisnik postaje njen admin.
publicAuth.post("/signup", (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const company = String(b.company || "").trim();
  const email = String(b.email || "").trim();
  const password = String(b.password || "");
  if (!name || !company || company.length > 120 || name.length > 120 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 200) {
    throw new HttpError(400, "invalid");
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new HttpError(409, "exists");
  const id = `u${randomBytes(4).toString("hex")}`;
  const hash = bcrypt.hashSync(password, 10);
  tx(() => {
    const orgId = createOrganization(company);
    db.prepare("INSERT INTO users (id, org_id, name, email, password_hash, role) VALUES (?,?,?,?,?,'admin')").run(id, orgId, name, email, hash);
  });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.status(201).json({ token: signToken(user, true), user: userView(user) });
});

// Uvek isti odgovor, da se ne otkriva da li nalog postoji. Slanje emaila još nije implementirano.
publicAuth.post("/forgot-password", (_req, res) => res.json({ ok: true }));

// OAuth sa Googlom nije podešen.
publicAuth.get("/google", () => {
  throw new HttpError(501, "google");
});

privateAuth.post("/logout", authenticate, (req, res) => {
  revokeToken(req.token);
  res.status(204).end();
});

privateAuth.get("/me", authenticate, (req, res) => res.json(userView(req.user)));
