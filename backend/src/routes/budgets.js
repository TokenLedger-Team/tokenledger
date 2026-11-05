import { Router } from "express";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { requireRole } from "../auth.js";
import { round2 } from "../util.js";
import { budgetFor, getAlertRules } from "../services/budgets.js";
import { scopedTeams } from "../services/scope.js";

export const router = Router();

router.get("/budgets", (req, res) => res.json(scopedTeams(db, req.user).map(budgetFor)));

router.put("/budgets/:teamId", requireRole("admin"), (req, res) => {
  const team = db.prepare("SELECT * FROM teams WHERE id = ? AND org_id = ?").get(req.params.teamId, req.user.org_id);
  if (!team) throw new HttpError(404, "notFound");
  const limit = Number(req.body?.limit);
  if (!(limit > 0) || !Number.isFinite(limit)) throw new HttpError(400, "invalid");
  db.prepare("INSERT INTO budgets (team_id, limit_usd) VALUES (?, ?) ON CONFLICT(team_id) DO UPDATE SET limit_usd = excluded.limit_usd").run(team.id, round2(limit));
  res.json(budgetFor(team));
});

router.get("/alert-rules", (req, res) => res.json(getAlertRules(req.user.org_id)));

router.put("/alert-rules", requireRole("admin", "lead"), (req, res) => {
  const cur = getAlertRules(req.user.org_id);
  const pct = Number(req.body?.warnAtPct ?? cur.warnAtPct);
  if (!(pct >= 1 && pct <= 100)) throw new HttpError(400, "invalid");
  const b = req.body || {};
  db.prepare(
    `INSERT INTO alert_rules (org_id, warn_at_pct, email_lead_at_warn, email_admins_at_limit, slack_at_limit) VALUES (?,?,?,?,?)
     ON CONFLICT(org_id) DO UPDATE SET warn_at_pct = excluded.warn_at_pct, email_lead_at_warn = excluded.email_lead_at_warn,
       email_admins_at_limit = excluded.email_admins_at_limit, slack_at_limit = excluded.slack_at_limit`
  ).run(req.user.org_id, pct, +!!b.emailLeadAtWarn, +!!b.emailAdminsAtLimit, +!!b.slackAtLimit);
  res.json(getAlertRules(req.user.org_id));
});
