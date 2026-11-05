import { db } from "../db.js";
import { addDays, round2, todayISO } from "../util.js";

export const REPLAY_DURATION_MS = 6000;
const DEFAULT_PEAK_LATENCY = 600;
const DEFAULT_CAND_LATENCY = 400;

/** Verdikt: sudija ≥ 90 i pravila ≥ 95 → switch; sudija ≥ 80 → check; inače dont. */
export function verdictOf(r) {
  if (r.judge_score >= 90 && r.rules_score >= 95) return "switch";
  if (r.judge_score >= 80) return "check";
  return "dont";
}

const peakLatency = (modelId, fallback) => {
  const m = db.prepare("SELECT fleet FROM models WHERE id = ?").get(modelId);
  return m?.fleet ? JSON.parse(m.fleet).peak[0] : fallback;
};

/**
 * Završava testove kojima je prošlo vreme izvršavanja. Pravi "sudija" ne postoji:
 * ocene su pseudo-slučajne ali stabilne za isti par funkcija/kandidat (isto kao mock).
 * Za verdikt "switch" nastaje routing pravilo (isključeno).
 */
export function settleReplays(orgId) {
  const due = db.prepare("SELECT * FROM replays WHERE org_id = ? AND status = 'running'").all(orgId)
    .filter((r) => Date.now() - new Date(r.created_at) > REPLAY_DURATION_MS);
  for (const r of due) {
    let h = 0;
    for (const ch of r.function + r.candidate_model) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const judge = 72 + (h % 27);
    const rules = r.scoring === "rules" ? 85 + (h % 15) : 80 + ((h >> 3) % 20);
    const done = db.transaction(() => {
      // status = 'running' u WHERE: dva istovremena zahteva ne završavaju isti test dvaput.
      const res = db.prepare(
        `UPDATE replays SET status='done', judge_score=?, rules_score=?, base_latency_ms=?, candidate_latency_ms=?
         WHERE id=? AND status='running'`
      ).run(judge, rules, peakLatency(r.base_model, DEFAULT_PEAK_LATENCY), peakLatency(r.candidate_model, DEFAULT_CAND_LATENCY), r.id);
      if (!res.changes) return;
      if (verdictOf({ judge_score: judge, rules_score: rules }) === "switch") {
        db.prepare("INSERT OR IGNORE INTO routing_rules (id, org_id, replay_id, enabled) VALUES (?,?,?,0)").run(`rr-${r.id}`, orgId, r.id);
      }
    });
    done();
  }
}

/** Ušteda: trošak funkcije na baseModel u poslednjih 30 dana (bez danas) minus isti tokeni po cenama kandidata. */
function savings(r) {
  const today = todayISO();
  const row = db.prepare(
    `SELECT COALESCE(SUM(COALESCE(u.cost, (u.input_tokens*b.input_price_per_1m + u.output_tokens*b.output_price_per_1m)/1e6)),0) now,
            COALESCE(SUM((u.input_tokens*c.input_price_per_1m + u.output_tokens*c.output_price_per_1m)/1e6),0) cand
     FROM usage u JOIN models b ON b.id = u.model JOIN models c ON c.id = ?
     WHERE u.org_id = ? AND u.team_id = ? AND u.function = ? AND u.model = ? AND u.date BETWEEN ? AND ?`
  ).get(r.candidate_model, r.org_id, r.team_id, r.function, r.base_model, addDays(today, -30), addDays(today, -1));
  const saved = Math.max(0, row.now - row.cand);
  return { saved, pct: row.now > 0 ? round2(saved / row.now) : 0 };
}

export function replayView(r) {
  const team = db.prepare("SELECT name FROM teams WHERE id = ?").get(r.team_id);
  const view = {
    id: r.id, teamId: r.team_id, teamName: team?.name ?? r.team_id, function: r.function, sampleSize: r.sample_size,
    baseModel: r.base_model, candidateModel: r.candidate_model, scoring: r.scoring, status: r.status, createdAt: r.created_at,
    judgeScore: r.judge_score, rulesScore: r.rules_score, baseLatencyMs: r.base_latency_ms, candidateLatencyMs: r.candidate_latency_ms,
    verdict: null, savingsPerMonth: null, savingsPct: null,
  };
  if (r.status !== "done") return view;
  const verdict = verdictOf(r);
  const s = savings(r);
  return { ...view, verdict, savingsPerMonth: verdict === "dont" ? 0 : round2(s.saved), savingsPct: s.pct };
}
