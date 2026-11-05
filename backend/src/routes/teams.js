import { Router } from "express";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { requireRole } from "../auth.js";
import { slugify } from "../util.js";
import { scopedTeams } from "../services/scope.js";
import { teamView } from "../services/catalog.js";

export const router = Router();

router.get("/teams", (req, res) => res.json(scopedTeams(db, req.user).map(teamView)));

router.post("/teams", requireRole("admin"), (req, res) => {
  const name = String(req.body?.name || "").trim();
  const slug = slugify(name);
  if (!name || !slug || name.length > 80) throw new HttpError(400, "invalid");
  if (db.prepare("SELECT 1 FROM teams WHERE org_id = ? AND slug = ?").get(req.user.org_id, slug)) throw new HttpError(409, "exists");
  let id = `t-${slug}`;
  if (db.prepare("SELECT 1 FROM teams WHERE id = ?").get(id)) id = `t-${slug}-${Date.now().toString(36)}`;
  db.prepare("INSERT INTO teams (id, org_id, name, slug) VALUES (?,?,?,?)").run(id, req.user.org_id, name, slug);
  res.status(201).json(teamView(db.prepare("SELECT * FROM teams WHERE id = ?").get(id)));
});
