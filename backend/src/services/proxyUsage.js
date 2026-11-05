import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { refreshTeamCatalog } from "./catalog.js";
import { slugify } from "../util.js";

const clean = (v, max = 100) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);

/** Zaglavlja X-TL-* -> { teamSlug, fn, client }. */
export function tagsFrom(req) {
  return {
    teamSlug: clean(req.get("x-tl-team")).toLowerCase(),
    fn: clean(req.get("x-tl-function")) || "default",
    client: clean(req.get("x-tl-client")) || null,
  };
}

/** Tim po slugu; nepoznat ili prazan slug ide u tim "Unassigned" (pravi se po potrebi). */
function resolveTeam(orgId, slug) {
  const find = (s) => db.prepare("SELECT id FROM teams WHERE org_id = ? AND slug = ?").get(orgId, s)?.id;
  const found = slug && (find(slug) || find(slugify(slug)));
  if (found) return found;
  const id = `t-unassigned-${orgId}`;
  db.prepare("INSERT OR IGNORE INTO teams (id, org_id, name, slug) VALUES (?,?,?,?)").run(id, orgId, "Unassigned", "unassigned");
  return find("unassigned") || id;
}

// Provajder vraća datirane ID-jeve (gpt-4o-mini-2024-07-18, claude-3-5-haiku-20241022).
const normModel = (id) => id.toLowerCase().replace(/-(\d{4}-\d{2}-\d{2}|\d{8})$/, "");

/** models.id za ime iz odgovora; nepoznat model se dodaje sa cenama 0 (admin ih podešava u Podešavanjima). */
function resolveModel(orgId, name, provider) {
  const all = db.prepare("SELECT id FROM models WHERE org_id = ?").all(orgId).map((m) => m.id);
  const exact = all.find((id) => id === name);
  if (exact) return exact;
  const n = normModel(name);
  const close = all.find((id) => normModel(id) === n);
  if (close) return close;
  db.prepare(
    "INSERT OR IGNORE INTO models (org_id, id, name, provider, family, input_price_per_1m, output_price_per_1m, context_window) VALUES (?,?,?,?,?,0,0,'—')"
  ).run(orgId, name, name, provider === "anthropic" ? "Anthropic" : "OpenAI", provider === "anthropic" ? "Claude" : "GPT");
  console.warn(`[proxy] nepoznat model "${name}" (org ${orgId}) dodat sa cenama 0, podesi cene u Podešavanjima`);
  return name;
}

/** Upisuje uspešan poziv (trošak se računa iz cena modela, pa je cost NULL). */
export function recordCall({ orgId, provider, tags, model, inputTokens, outputTokens, latencyMs }) {
  const teamId = resolveTeam(orgId, tags.teamSlug);
  const now = new Date();
  db.prepare(
    `INSERT INTO usage (org_id, date, hour, team_id, function, client, model, requests, input_tokens, output_tokens, cost, latency_ms, source)
     VALUES (?,?,?,?,?,?,?,1,?,?,NULL,?,'proxy')`
  ).run(orgId, now.toISOString().slice(0, 10), now.getUTCHours(), teamId, tags.fn, tags.client, resolveModel(orgId, model, provider), inputTokens, outputTokens, latencyMs);
  refreshTeamCatalog(teamId);
}

const RETRY_WINDOW_MS = 3600_000;

/** Neuspeo poziv: uvećava brojač u tekućem satu za isti tim/funkciju/klijent (anomalija "retry"). */
export function recordFailure({ orgId, tags }) {
  const teamId = resolveTeam(orgId, tags.teamSlug);
  const now = new Date();
  const since = new Date(now.getTime() - RETRY_WINDOW_MS).toISOString();
  const open = db
    .prepare("SELECT id FROM retry_events WHERE org_id = ? AND team_id = ? AND function = ? AND client IS ? AND detected_at >= ? ORDER BY detected_at DESC LIMIT 1")
    .get(orgId, teamId, tags.fn, tags.client, since);
  if (open) db.prepare("UPDATE retry_events SET failed_retries = failed_retries + 1, detected_at = ? WHERE id = ?").run(now.toISOString(), open.id);
  else
    db.prepare("INSERT INTO retry_events (id, org_id, team_id, function, client, failed_retries, hours, detected_at) VALUES (?,?,?,?,?,1,1,?)").run(
      `rt-${randomUUID().slice(0, 8)}`, orgId, teamId, tags.fn, tags.client, now.toISOString()
    );
}
