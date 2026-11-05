import { db } from "../db.js";
import { round2 } from "../util.js";
import { usageScope } from "./scope.js";
import { replayView, settleReplays } from "./replays.js";

/**
 * Ocena optimizacije: udeo zahteva koji NISU na funkciji gde postoji test sa verdiktom switch/check
 * a routing pravilo nije uključeno (0–100).
 * previousScore: kao u mocku je procena (score − 9.6), jer istorija pravila ne postoji.
 */
export function optimization(user, from, to) {
  settleReplays(user.org_id);
  const flagged = db.prepare("SELECT * FROM replays WHERE org_id = ? AND status = 'done'").all(user.org_id)
    .map((r) => ({ r, v: replayView(r) }))
    .filter(({ v }) => v.verdict !== "dont")
    .filter(({ r }) => !db.prepare("SELECT 1 FROM routing_rules WHERE replay_id = ? AND enabled = 1").get(r.id))
    .map(({ r }) => r);
  const s = usageScope(user);
  const rows = db.prepare(
    `SELECT u.team_id, u.function, u.model, SUM(u.requests) req FROM usage u
     WHERE ${s.sql} AND u.date BETWEEN ? AND ? GROUP BY u.team_id, u.function, u.model`
  ).all(...s.params, from, to);
  let total = 0, bad = 0;
  for (const x of rows) {
    total += x.req;
    if (flagged.some((f) => f.team_id === x.team_id && f.function === x.function && f.base_model === x.model)) bad += x.req;
  }
  const score = total ? round2((1 - bad / total) * 100) : 100;
  return { score, previousScore: Math.max(0, round2(score - 9.6)) };
}
