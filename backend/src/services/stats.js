import { db } from "../db.js";
import { addDays, round2 } from "../util.js";
import { usageScope, COST_SQL, USAGE_FROM } from "./scope.js";

export function summary(user, from, to) {
  const s = usageScope(user);
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(${COST_SQL}),0) cost, COALESCE(SUM(u.input_tokens),0) inp,
              COALESCE(SUM(u.output_tokens),0) outp, COALESCE(SUM(u.requests),0) req
       FROM ${USAGE_FROM} WHERE ${s.sql} AND u.date BETWEEN ? AND ?`
    )
    .get(...s.params, from, to);
  return { from, to, totalCost: round2(r.cost), totalTokens: r.inp + r.outp, inputTokens: r.inp, outputTokens: r.outp, requests: r.req };
}

export function timeseries(user, from, to) {
  const s = usageScope(user);
  const rows = db
    .prepare(
      `SELECT u.date, SUM(${COST_SQL}) cost, SUM(u.input_tokens + u.output_tokens) tokens, SUM(u.requests) requests
       FROM ${USAGE_FROM} WHERE ${s.sql} AND u.date BETWEEN ? AND ? GROUP BY u.date`
    )
    .all(...s.params, from, to);
  const byDay = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = byDay.get(d);
    out.push({ date: d, cost: round2(v?.cost ?? 0), tokens: v?.tokens ?? 0, requests: v?.requests ?? 0 });
  }
  return out;
}

export function breakdown(user, from, to, by) {
  const s = usageScope(user);
  const keyExpr = { team: "u.team_id", function: "u.team_id || ':' || u.function", client: "COALESCE(u.client, '')", model: "u.model" }[by];
  const rows = db
    .prepare(
      `SELECT ${keyExpr} AS key, MIN(u.team_id) team_id, MIN(u.function) fn, MIN(m.name) model_name,
              SUM(${COST_SQL}) cost, SUM(u.input_tokens + u.output_tokens) tokens, SUM(u.requests) requests
       FROM ${USAGE_FROM} WHERE ${s.sql} AND u.date BETWEEN ? AND ? GROUP BY key`
    )
    .all(...s.params, from, to);
  const teamNames = new Map(db.prepare("SELECT id, name FROM teams").all().map((t) => [t.id, t.name]));
  return rows
    .map((r) => {
      const item = { key: r.key, label: null, cost: round2(r.cost), tokens: r.tokens, requests: r.requests };
      if (by === "team") item.label = teamNames.get(r.key) ?? r.key;
      else if (by === "function") {
        item.label = r.fn;
        item.teamId = r.team_id;
        item.teamName = teamNames.get(r.team_id);
      } else if (by === "client") item.label = r.key || null;
      else item.label = r.model_name;
      return item;
    })
    .sort((a, b) => b.cost - a.cost);
}
