import { Router } from "express";
import { db } from "../db.js";
import { HttpError, messages } from "../i18n.js";
import { requireRole } from "../auth.js";
import { isISODate, slugify } from "../util.js";
import { refreshTeamCatalog } from "../services/catalog.js";

export const router = Router();

const MAX_ROWS = 20000;
const blank = (v) => v === undefined || v === null || String(v).trim() === "";
// Prazno polje = nije uneto; inače mora biti nenegativan broj.
const num = (v) => (blank(v) ? null : Number(v));
const validNum = (n) => n !== null && Number.isFinite(n) && n >= 0;

router.post("/usage/import", requireRole("admin", "lead"), (req, res) => {
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new HttpError(400, "invalid");
  const m = messages(req.lang);
  const orgId = req.user.org_id;
  const teams = db.prepare("SELECT * FROM teams WHERE org_id = ?").all(orgId);
  const models = db.prepare("SELECT * FROM models").all();
  const insert = db.prepare(
    `INSERT INTO usage (org_id, date, team_id, function, client, model, requests, input_tokens, output_tokens, cost, source)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'import')`
  );
  const errors = [];
  let imported = 0;
  const touched = new Set();

  db.transaction(() => {
    rows.forEach((row, i) => {
      const r = row && typeof row === "object" ? row : {};
      const t = String(r.team ?? "").trim().toLowerCase();
      const mo = String(r.model ?? "").trim().toLowerCase();
      const team = teams.find((x) => x.slug === t || x.name.toLowerCase() === t);
      const model = models.find((x) => x.id === mo || x.name.toLowerCase() === mo);
      const fn = slugify(r.function ?? "");
      const input = num(r.inputTokens);
      const output = num(r.outputTokens);
      const cost = num(r.cost);
      const requests = blank(r.requests) ? 0 : Number(r.requests);
      const valid =
        isISODate(r.date) && team && model && fn && validNum(input) && validNum(output) &&
        (cost === null || validNum(cost)) && validNum(requests);
      // Vođa tima sme da uvozi samo za svoj tim.
      if (!valid || (req.user.role === "lead" && team.id !== req.user.team_id)) {
        errors.push({ row: i + 1, message: m.invalid });
        return;
      }
      insert.run(orgId, r.date, team.id, fn, blank(r.client) ? null : slugify(r.client), model.id,
        Math.round(requests), Math.round(input), Math.round(output), cost);
      touched.add(team.id);
      imported++;
    });
    touched.forEach(refreshTeamCatalog);
  })();

  res.status(201).json({ imported, skipped: errors.length, errors: errors.slice(0, 20) });
});
