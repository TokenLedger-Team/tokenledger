import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { requireRole } from "../auth.js";
import { userView } from "../services/catalog.js";

export const router = Router();
router.use("/users", requireRole("admin"));

const ROLES = ["admin", "lead", "observer"];
const teamOk = (orgId, teamId) => !teamId || !!db.prepare("SELECT 1 FROM teams WHERE id = ? AND org_id = ?").get(teamId, orgId);

router.get("/users", (req, res) => {
  res.json(db.prepare("SELECT * FROM users WHERE org_id = ? ORDER BY rowid").all(req.user.org_id).map(userView));
});

// Pozivnica emailom još nije implementirana: admin pri pozivanju zadaje početnu lozinku (min. 8 znakova).
// Bez lozinke korisnik se pravi, ali ne može da se prijavi dok mu je admin ne postavi.
router.post("/users", (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim();
  const password = b.password === undefined || b.password === "" ? null : String(b.password);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !ROLES.includes(b.role) || !teamOk(req.user.org_id, b.teamId)) throw new HttpError(400, "invalid");
  if (password !== null && (password.length < 8 || password.length > 200)) throw new HttpError(400, "invalid");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new HttpError(409, "exists");
  const id = `u${randomBytes(4).toString("hex")}`;
  db.prepare("INSERT INTO users (id, org_id, name, email, password_hash, role, team_id) VALUES (?,?,?,?,?,?,?)").run(
    id, req.user.org_id, name, email, password === null ? null : bcrypt.hashSync(password, 10), b.role, b.teamId || null
  );
  res.status(201).json(userView(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
});

router.put("/users/:id", (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id = ? AND org_id = ?").get(req.params.id, req.user.org_id);
  if (!target) throw new HttpError(404, "notFound");
  const b = req.body || {};
  const next = { name: target.name, role: target.role, team_id: target.team_id };
  if (b.name !== undefined) {
    next.name = String(b.name).trim();
    if (!next.name) throw new HttpError(400, "invalid");
  }
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) throw new HttpError(400, "invalid");
    next.role = b.role;
  }
  if (b.teamId !== undefined) {
    if (!teamOk(req.user.org_id, b.teamId)) throw new HttpError(400, "invalid");
    next.team_id = b.teamId || null;
  }
  db.prepare("UPDATE users SET name = ?, role = ?, team_id = ? WHERE id = ?").run(next.name, next.role, next.team_id, target.id);
  res.json(userView(db.prepare("SELECT * FROM users WHERE id = ?").get(target.id)));
});

router.delete("/users/:id", (req, res) => {
  if (req.params.id === req.user.id) throw new HttpError(403, "forbidden");
  const r = db.prepare("DELETE FROM users WHERE id = ? AND org_id = ?").run(req.params.id, req.user.org_id);
  if (!r.changes) throw new HttpError(404, "notFound");
  res.status(204).end();
});
