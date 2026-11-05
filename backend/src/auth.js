import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { config } from "./config.js";
import { HttpError } from "./i18n.js";

export function signToken(user, remember) {
  const expiresIn = remember ? "30d" : "12h";
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn, jwtid: randomUUID() });
}

/** Proverava Bearer token i postavlja req.user (svež red iz baze, pa promena uloge važi odmah). */
export function authenticate(req, _res, next) {
  const m = /^Bearer (.+)$/i.exec(req.get("authorization") || "");
  if (!m) throw new HttpError(401, "session");
  let payload;
  try {
    payload = jwt.verify(m[1], config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    throw new HttpError(401, "session");
  }
  if (db.prepare("SELECT 1 FROM revoked_tokens WHERE jti = ?").get(payload.jti)) throw new HttpError(401, "session");
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub);
  if (!user) throw new HttpError(401, "session");
  req.user = user;
  req.token = payload;
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, "forbidden");
  next();
};

export function revokeToken(payload) {
  db.prepare("DELETE FROM revoked_tokens WHERE expires_at < ?").run(Math.floor(Date.now() / 1000));
  db.prepare("INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)").run(payload.jti, payload.exp);
}
