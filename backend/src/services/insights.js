import { db } from "../db.js";
import { addDays, round2, todayISO } from "../util.js";
import { COST_SQL, USAGE_FROM, scopedTeams, usageScope } from "./scope.js";
import { budgetFor } from "./budgets.js";

/** Spike: dnevni trošak funkcije > 2.5 × prosek prethodnih 7 dana (gleda poslednjih 7 punih dana). */
function spikes(user) {
  const today = todayISO();
  const s = usageScope(user);
  const rows = db.prepare(
    `SELECT u.team_id, u.function, u.date, COALESCE(u.client,'') client, SUM(${COST_SQL}) cost
     FROM ${USAGE_FROM} WHERE ${s.sql} AND u.date BETWEEN ? AND ? GROUP BY u.team_id, u.function, u.date, client`
  ).all(...s.params, addDays(today, -14), addDays(today, -1));
  const teamNames = new Map(db.prepare("SELECT id, name FROM teams").all().map((t) => [t.id, t.name]));
  const byFn = new Map(); // "team|fn" → Map(date → {cost, clients:Map})
  for (const r of rows) {
    const k = `${r.team_id}|${r.function}`;
    const days = byFn.get(k) || new Map();
    const d = days.get(r.date) || { cost: 0, clients: new Map() };
    d.cost += r.cost;
    d.clients.set(r.client, (d.clients.get(r.client) || 0) + r.cost);
    days.set(r.date, d);
    byFn.set(k, days);
  }
  const out = [];
  for (const [k, days] of byFn) {
    const [teamId, fn] = k.split("|");
    for (let i = 1; i <= 7; i++) {
      const d = addDays(today, -i);
      let base = 0;
      for (let j = 1; j <= 7; j++) base += days.get(addDays(d, -j))?.cost ?? 0;
      base /= 7;
      const day = days.get(d);
      const value = day?.cost ?? 0;
      if (base > 0 && value / base > 2.5) {
        // Klijent koji je taj dan najviše doprineo (null ako je poziv bez klijenta).
        const client = [...day.clients.entries()].sort((a, b) => b[1] - a[1])[0][0] || null;
        out.push({ id: `an-${teamId}|${fn}|${client || ""}-${d}`, type: "spike", teamId, teamName: teamNames.get(teamId), function: fn, client, date: d, factor: round2(value / base), detectedAt: new Date().toISOString() });
      }
    }
  }
  return out;
}

function retries(user) {
  const lead = user.role === "lead";
  return db
    .prepare(`SELECT e.*, t.name team_name FROM retry_events e JOIN teams t ON t.id = e.team_id WHERE e.org_id = ?${lead ? " AND e.team_id = ?" : ""}`)
    .all(...(lead ? [user.org_id, user.team_id ?? ""] : [user.org_id]))
    .map((e) => ({ id: e.id, type: "retry", teamId: e.team_id, teamName: e.team_name, function: e.function, client: e.client ?? null, failedRetries: e.failed_retries, hours: e.hours, detectedAt: e.detected_at }));
}

export const anomalies = (user) => [...spikes(user), ...retries(user)];

export function cache(user) {
  const today = todayISO();
  const s = usageScope(user);
  const last30 = db.prepare(`SELECT COALESCE(SUM(${COST_SQL}),0) c FROM ${USAGE_FROM} WHERE ${s.sql} AND u.date BETWEEN ? AND ?`)
    .get(...s.params, addDays(today, -30), addDays(today, -1)).c;
  const o = db.prepare("SELECT * FROM org_settings WHERE org_id = ?").get(user.org_id);
  const share = o?.repeat_share ?? 0;
  let largestSource = null;
  const inScope = o?.repeat_team_id && (user.role !== "lead" || o.repeat_team_id === user.team_id);
  if (inScope) {
    largestSource = { teamName: db.prepare("SELECT name FROM teams WHERE id = ?").get(o.repeat_team_id)?.name, function: o.repeat_function };
  }
  return { repeatShare: share, estMonthlySavings: round2(last30 * share * 0.35), largestSource };
}

export function forecast(user) {
  const b = scopedTeams(db, user).map(budgetFor);
  return { month: todayISO().slice(0, 7), projected: round2(b.reduce((s, x) => s + x.forecast, 0)), budget: round2(b.reduce((s, x) => s + (x.limit || 0), 0)) };
}
