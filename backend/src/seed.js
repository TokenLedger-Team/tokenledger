// Puni bazu demo podacima (isti kao frontend/js/mock/data.js). Briše postojeće podatke.
// Ne uvozi mock/data.js direktno: on zavisi od browser koda (format.js → localStorage),
// pa je ovde preneta ista logika generisanja (isti seed slučajnih brojeva, isti tokovi).
import bcrypt from "bcryptjs";
import { db, tx } from "./db.js";
import { config, requireSecrets } from "./config.js";
import { addDays, parseISODate, round2, todayISO } from "./util.js";
import { encrypt } from "./services/crypto.js";
import { refreshTeamCatalog } from "./services/catalog.js";
import { DEFAULT_MODELS, createOrganization } from "./services/organizations.js";

requireSecrets();

const ORG = { id: "org-1", name: "Acme Corp" };

const TEAMS = [
  { id: "t-support", name: "Support", slug: "support" },
  { id: "t-eng", name: "Engineering", slug: "engineering" },
  { id: "t-mkt", name: "Marketing", slug: "marketing" },
  { id: "t-data", name: "Data", slug: "data" },
];

const STREAMS = [
  { teamId: "t-support", fn: "ticket-classification", client: null, model: "gpt-4o", req: 52000, inTok: 900, outTok: 60 },
  { teamId: "t-support", fn: "chat-assistant", client: "acme", model: "gpt-4o", req: 9000, inTok: 2500, outTok: 400 },
  { teamId: "t-support", fn: "faq-answers", client: null, model: "gpt-4o-mini", req: 30000, inTok: 1200, outTok: 250 },
  { teamId: "t-eng", fn: "code-review", client: null, model: "claude-sonnet", req: 4200, inTok: 6000, outTok: 900 },
  { teamId: "t-eng", fn: "doc-summarization", client: null, model: "claude-sonnet", req: 3000, inTok: 8000, outTok: 600 },
  { teamId: "t-eng", fn: "test-generation", client: null, model: "gpt-4.1", req: 2200, inTok: 4000, outTok: 1500 },
  { teamId: "t-mkt", fn: "client-campaigns", client: "acme", model: "claude-sonnet", req: 1800, inTok: 3000, outTok: 1200 },
  { teamId: "t-mkt", fn: "copywriting", client: "globex", model: "gpt-4o", req: 4000, inTok: 1500, outTok: 800 },
  { teamId: "t-mkt", fn: "image-captions", client: null, model: "gemini-pro", req: 6000, inTok: 1200, outTok: 150 },
  { teamId: "t-data", fn: "enrichment", client: "initech", model: "gemini-flash", req: 90000, inTok: 1500, outTok: 200 },
  { teamId: "t-data", fn: "tagging-routing", client: null, model: "gpt-4o", req: 30000, inTok: 600, outTok: 40 },
  { teamId: "t-data", fn: "extraction", client: null, model: "claude-haiku", req: 14000, inTok: 3000, outTok: 300 },
  { teamId: "t-eng", fn: "internal-chat", client: null, model: "llama-70b", req: 3000, inTok: 2000, outTok: 500 },
];

const HOUR_CURVE = [0.4, 0.3, 0.25, 0.25, 0.3, 0.5, 1.2, 2.6, 4.8, 6.9, 8.6, 8.1, 6.4, 7.2, 7.9, 7.1, 6.0, 4.6, 3.2, 2.4, 1.8, 1.3, 0.9, 0.6];

const USERS = [
  ["u1", "Ana Petrović", "admin@firma.rs", "admin", null],
  ["u2", "Marko Jovanović", "lead@firma.rs", "lead", "t-support"],
  ["u3", "Jelena Nikolić", "observer@firma.rs", "observer", null],
  ["u4", "Stefan Ilić", "stefan@firma.rs", "lead", "t-eng"],
  ["u5", "Milica Đorđević", "milica@firma.rs", "lead", "t-mkt"],
  ["u6", "Nikola Stojanović", "nikola@firma.rs", "observer", "t-data"],
];

// Faktor početnog limita u odnosu na potrošnju poslednjih 30 dana (da demo ima razne statuse).
const LIMIT_FACTOR = { "t-support": 1.25, "t-eng": 1.02, "t-mkt": 0.85, "t-data": 1.6 };

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateUsage(days = 180) {
  const rand = seededRandom(7);
  const today = todayISO();
  const now = new Date();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const dow = parseISODate(date).getDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 1 + (days - i) / days / 4;
    for (const s of STREAMS) {
      let factor = (weekend ? 0.35 : 1) * trend * (0.8 + rand() * 0.4);
      if (i === 3 && s.fn === "client-campaigns") factor *= 3.4; // namerni skok za demo anomalija
      if (i === 0) factor *= HOUR_CURVE.slice(0, Math.floor(nowHour)).reduce((a, b) => a + b, 0) / 100;
      const requests = Math.round(s.req * factor);
      rows.push({
        date, teamId: s.teamId, fn: s.fn, client: s.client, model: s.model, requests,
        inputTokens: Math.round(requests * s.inTok * (0.9 + rand() * 0.2)),
        outputTokens: Math.round(requests * s.outTok * (0.9 + rand() * 0.2)),
      });
    }
  }
  return rows;
}

const REPLAYS = [
  { id: "r1", teamId: "t-support", fn: "ticket-classification", sampleSize: 200, base: "gpt-4o", cand: "gpt-4o-mini", judge: 94, rules: 98, baseMs: 640, candMs: 260 },
  { id: "r2", teamId: "t-eng", fn: "doc-summarization", sampleSize: 150, base: "claude-sonnet", cand: "claude-haiku", judge: 86, rules: 93, baseMs: 820, candMs: 300 },
  { id: "r3", teamId: "t-support", fn: "chat-assistant", sampleSize: 200, base: "gpt-4o", cand: "gpt-4o-mini", judge: 71, rules: 80, baseMs: 640, candMs: 260 },
  { id: "r4", teamId: "t-data", fn: "tagging-routing", sampleSize: 300, base: "gpt-4o", cand: "gpt-4o-mini", judge: 96, rules: 99, baseMs: 640, candMs: 260 },
];

const PROVIDER_KEYS = [
  ["k1", "openai", "production", "3f9a"],
  ["k2", "anthropic", "production", "b21c"],
  ["k3", "google", "staging", "7d04"],
];

tx(() => {
  for (const t of ["revoked_tokens", "retry_events", "org_settings", "routing_rules", "replays", "provider_keys", "alert_rules", "budgets", "usage", "users", "teams", "models", "organizations"]) {
    db.exec(`DELETE FROM ${t}`);
  }
  createOrganization(ORG.name, ORG.id);

  const insTeam = db.prepare("INSERT INTO teams (id, org_id, name, slug) VALUES (?,?,?,?)");
  TEAMS.forEach((t) => insTeam.run(t.id, ORG.id, t.name, t.slug));

  const hash = bcrypt.hashSync(config.seedPassword, 10);
  const insUser = db.prepare("INSERT INTO users (id, org_id, name, email, password_hash, role, team_id) VALUES (?,?,?,?,?,?,?)");
  USERS.forEach(([id, name, email, role, teamId]) => insUser.run(id, ORG.id, name, email, hash, role, teamId));

  const insUsage = db.prepare(
    `INSERT INTO usage (org_id, date, team_id, function, client, model, requests, input_tokens, output_tokens, source)
     VALUES (?,?,?,?,?,?,?,?,?, 'proxy')`
  );
  const rows = generateUsage(180);
  for (const r of rows) insUsage.run(ORG.id, r.date, r.teamId, r.fn, r.client, r.model, r.requests, r.inputTokens, r.outputTokens);
  TEAMS.forEach((t) => refreshTeamCatalog(t.id));

  // Početni limiti: potrošnja poslednjih 30 dana × faktor, zaokruženo na 50 (kao u mocku).
  const price = new Map(DEFAULT_MODELS.map((m) => [m[0], { i: m[4], o: m[5] }]));
  const from30 = addDays(todayISO(), -29);
  const insBudget = db.prepare("INSERT INTO budgets (team_id, limit_usd) VALUES (?, ?)");
  for (const t of TEAMS) {
    const spent30 = rows
      .filter((r) => r.teamId === t.id && r.date >= from30)
      .reduce((s, r) => s + (r.inputTokens * price.get(r.model).i + r.outputTokens * price.get(r.model).o) / 1e6, 0);
    insBudget.run(t.id, Math.max(100, Math.round((spent30 * LIMIT_FACTOR[t.id]) / 50) * 50));
  }


  // Replay testovi i routing pravila iz mocka (završeni pre 3 dana).
  const created = new Date(Date.now() - 86400000 * 3).toISOString();
  const insReplay = db.prepare(
    `INSERT INTO replays (id, org_id, team_id, function, sample_size, base_model, candidate_model, scoring, status, judge_score, rules_score, base_latency_ms, candidate_latency_ms, created_at)
     VALUES (?,?,?,?,?,?,?,'judge_rules','done',?,?,?,?,?)`
  );
  for (const r of REPLAYS) insReplay.run(r.id, ORG.id, r.teamId, r.fn, r.sampleSize, r.base, r.cand, r.judge, r.rules, r.baseMs, r.candMs, created);
  db.prepare("INSERT INTO routing_rules (id, org_id, replay_id, enabled) VALUES (?,?,?,?)").run("rr-r1", ORG.id, "r1", 1);
  db.prepare("INSERT INTO routing_rules (id, org_id, replay_id, enabled) VALUES (?,?,?,?)").run("rr-r4", ORG.id, "r4", 0);

  // Brojači koje će puniti proxy; za demo isti kao u mocku.
  db.prepare("UPDATE org_settings SET mask_pii = 1, masked_last7 = 412, repeat_share = 0.18, repeat_team_id = 't-support', repeat_function = 'faq-answers' WHERE org_id = ?")
    .run(ORG.id);
  db.prepare("INSERT INTO retry_events (id, org_id, team_id, function, client, failed_retries, hours, detected_at) VALUES (?,?,?,?,?,?,?,?)")
    .run("an-retry", ORG.id, "t-support", "ticket-classification", null, 1240, 2, new Date(Date.now() - 5400000).toISOString());

  // Demo ključevi su izmišljeni; čuvaju se šifrovani kao i pravi.
  const insKey = db.prepare("INSERT INTO provider_keys (id, org_id, provider_id, environment, encrypted_key, last4) VALUES (?,?,?,?,?,?)");
  PROVIDER_KEYS.forEach(([id, provider, env, last4]) => insKey.run(id, ORG.id, provider, env, encrypt(`demo-key-${provider}-${last4}`), last4));
});

console.log(`Seed gotov: ${db.prepare("SELECT COUNT(*) c FROM usage").get().c} redova potrošnje.`);
console.log(`Demo nalozi (lozinka "${config.seedPassword}"): ${USERS.filter((u) => u[0] <= "u3").map((u) => u[2]).join(", ")}`);
