import { Router } from "express";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { requireRole } from "../auth.js";
import { isISODate } from "../util.js";
import { replayView, settleReplays } from "../services/replays.js";
import { optimization } from "../services/optimization.js";
import { anomalies, cache, forecast } from "../services/insights.js";

export const router = Router();
const ruleView = (r) => r && { id: r.id, replayId: r.replay_id, teamId: r.team_id, teamName: r.team_name, function: r.function, fromModel: r.base_model, toModel: r.candidate_model, minJudgeScore: 90, enabled: !!r.enabled };

// ----- Replay -----
router.get("/replays", (req, res) => {
  settleReplays(req.user.org_id);
  const lead = req.user.role === "lead";
  const list = db
    .prepare(`SELECT * FROM replays WHERE org_id = ?${lead ? " AND team_id = ?" : ""} ORDER BY rowid`)
    .all(...(lead ? [req.user.org_id, req.user.team_id ?? ""] : [req.user.org_id]))
    .map(replayView);
  res.json(list.sort((a, b) => (b.savingsPerMonth ?? -1) - (a.savingsPerMonth ?? -1)));
});

router.post("/replays", requireRole("admin", "lead"), (req, res) => {
  const b = req.body || {};
  if (req.user.role === "lead" && b.teamId !== req.user.team_id) throw new HttpError(403, "forbidden");
  const sampleSize = Number(b.sampleSize);
  const candidate = db.prepare("SELECT id FROM models WHERE id = ?").get(b.candidateModel);
  // Bazni model = model koji ta funkcija trenutno najviše koristi.
  const base = db
    .prepare("SELECT model, SUM(requests) req FROM usage WHERE org_id = ? AND team_id = ? AND function = ? GROUP BY model ORDER BY req DESC LIMIT 1")
    .get(req.user.org_id, String(b.teamId), String(b.function));
  if (!base || !candidate || !Number.isInteger(sampleSize) || sampleSize < 20 || sampleSize > 1000) throw new HttpError(400, "invalid");
  const id = `r${randomBytes(4).toString("hex")}`;
  db.prepare(
    `INSERT INTO replays (id, org_id, team_id, function, sample_size, base_model, candidate_model, scoring, status, created_at)
     VALUES (?,?,?,?,?,?,?,?, 'running', ?)`
  ).run(id, req.user.org_id, b.teamId, b.function, sampleSize, base.model, candidate.id, b.scoring === "rules" ? "rules" : "judge_rules", new Date().toISOString());
  res.status(201).json(replayView(db.prepare("SELECT * FROM replays WHERE id = ?").get(id)));
});

router.get("/stats/optimization", (req, res) => {
  const { from, to } = req.query;
  if (!isISODate(from) || !isISODate(to)) throw new HttpError(400, "range");
  res.json(optimization(req.user, from, to));
});

// ----- Uvidi -----
router.get("/insights/anomalies", (req, res) => res.json(anomalies(req.user)));
router.get("/insights/cache", (req, res) => res.json(cache(req.user)));
router.get("/insights/forecast", (req, res) => res.json(forecast(req.user)));

// ----- Routing pravila -----
const RULE_SQL = `SELECT x.*, r.team_id, r.function, r.base_model, r.candidate_model, t.name team_name
  FROM routing_rules x JOIN replays r ON r.id = x.replay_id JOIN teams t ON t.id = r.team_id`;

router.get("/routing-rules", (req, res) => {
  settleReplays(req.user.org_id);
  const lead = req.user.role === "lead";
  res.json(
    db.prepare(`${RULE_SQL} WHERE x.org_id = ?${lead ? " AND r.team_id = ?" : ""} ORDER BY x.rowid`)
      .all(...(lead ? [req.user.org_id, req.user.team_id ?? ""] : [req.user.org_id]))
      .map(ruleView)
  );
});

router.put("/routing-rules/:id", (req, res) => {
  settleReplays(req.user.org_id);
  const rule = db.prepare(`${RULE_SQL} WHERE x.id = ? AND x.org_id = ?`).get(req.params.id, req.user.org_id);
  if (!rule) throw new HttpError(404, "notFound");
  if (req.user.role === "observer" || (req.user.role === "lead" && rule.team_id !== req.user.team_id)) throw new HttpError(403, "forbidden");
  const enabled = +!!req.body?.enabled;
  db.prepare("UPDATE routing_rules SET enabled = ? WHERE id = ?").run(enabled, rule.id);
  res.json({ id: rule.id, enabled: !!enabled });
});

// ----- Privatnost -----
const privacy = (orgId) => {
  const o = db.prepare("SELECT * FROM org_settings WHERE org_id = ?").get(orgId);
  return { maskPii: !!(o?.mask_pii ?? 1), maskedLast7Days: o?.masked_last7 ?? 0 };
};
router.get("/settings/privacy", (req, res) => res.json(privacy(req.user.org_id)));
router.put("/settings/privacy", requireRole("admin"), (req, res) => {
  db.prepare("INSERT INTO org_settings (org_id, mask_pii) VALUES (?, ?) ON CONFLICT(org_id) DO UPDATE SET mask_pii = excluded.mask_pii")
    .run(req.user.org_id, +!!req.body?.maskPii);
  res.json(privacy(req.user.org_id));
});

// ----- Izveštaji -----
const reportStatus = (orgId) => {
  const o = db.prepare("SELECT * FROM org_settings WHERE org_id = ?").get(orgId);
  return { lastImportAt: o?.last_import_at ?? null, lastExportAt: o?.last_export_at ?? null };
};
router.get("/reports/status", (req, res) => res.json(reportStatus(req.user.org_id)));
router.post("/reports/exports", (req, res) => {
  if (!["csv", "pdf"].includes(req.body?.format)) throw new HttpError(400, "invalid");
  db.prepare("INSERT INTO org_settings (org_id, last_export_at) VALUES (?, ?) ON CONFLICT(org_id) DO UPDATE SET last_export_at = excluded.last_export_at")
    .run(req.user.org_id, new Date().toISOString());
  res.status(201).json(reportStatus(req.user.org_id));
});
