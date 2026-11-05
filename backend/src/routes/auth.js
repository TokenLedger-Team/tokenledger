import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { authenticate, revokeToken, signToken } from "../auth.js";
import { userView } from "../services/catalog.js";

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

privateAuth.post("/logout", authenticate, (req, res) => {
  revokeToken(req.token);
  res.status(204).end();
});

privateAuth.get("/me", authenticate, (req, res) => res.json(userView(req.user)));
