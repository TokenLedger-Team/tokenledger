import { db } from "../db.js";
import { addDays, parseISODate, round2, todayISO } from "../util.js";
import { COST_SQL, USAGE_FROM } from "./scope.js";

const costBetween = (teamId, from, to) =>
  db.prepare(`SELECT COALESCE(SUM(${COST_SQL}),0) c FROM ${USAGE_FROM} WHERE u.team_id = ? AND u.date BETWEEN ? AND ?`).get(teamId, from, to).c;

export const getAlertRules = (orgId) => {
  const r = db.prepare("SELECT * FROM alert_rules WHERE org_id = ?").get(orgId);
  return {
    warnAtPct: r?.warn_at_pct ?? 80,
    emailLeadAtWarn: !!(r?.email_lead_at_warn ?? 1),
    emailAdminsAtLimit: !!(r?.email_admins_at_limit ?? 1),
    slackAtLimit: !!(r?.slack_at_limit ?? 0),
  };
};

/** Jedan red budžeta za tim. Pravila: "Pravila obračuna" u API.md (forecast kao u mocku). */
export function budgetFor(team) {
  const today = todayISO();
  const d = parseISODate(today);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const remainingDays = daysInMonth - d.getDate();
  const monthStart = today.slice(0, 8) + "01";

  const spent = round2(costBetween(team.id, monthStart, today));
  // Prosek poslednjih 7 punih dana (bez današnjeg).
  const dailyAverage = round2(costBetween(team.id, addDays(today, -7), addDays(today, -1)) / 7);
  const now = new Date();
  const dayFractionDone = (now.getHours() + now.getMinutes() / 60) / 24;
  const forecast = round2(spent + dailyAverage * (remainingDays + 1 - dayFractionDone));

  const row = db.prepare("SELECT limit_usd FROM budgets WHERE team_id = ?").get(team.id);
  const limit = row?.limit_usd ?? null;
  const { warnAtPct } = getAlertRules(team.org_id);
  let status = "none";
  if (limit) {
    if (spent >= limit) status = "over";
    else if (spent >= (limit * warnAtPct) / 100) status = "almost";
    else if (forecast >= limit) status = "willExceed";
    else status = "ok";
  }
  return { teamId: team.id, teamName: team.name, limit, spent, dailyAverage, forecast, status };
}
