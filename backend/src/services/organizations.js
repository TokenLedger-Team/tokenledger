import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { publicProxyUrl } from "../config.js";

// Početni katalog modela (USD po 1M tokena, ilustrativne cene, nisu trenutne cene provajdera).
// fleet = [latencija ms, opterećenje %, protok/min] van vrha i u vrhu. Svaka organizacija dobija svoju kopiju.
export const DEFAULT_MODELS = [
  ["gpt-4o", "GPT-4o", "OpenAI", "GPT", 2.5, 10, "128k", [380, 41, 18000], [640, 86, 42000]],
  ["gpt-4o-mini", "GPT-4o mini", "OpenAI", "GPT", 0.15, 0.6, "128k", [190, 30, 22000], [260, 62, 46000]],
  ["gpt-4.1", "GPT-4.1", "OpenAI", "GPT", 2, 8, "1M", [420, 35, 9000], [610, 71, 21000]],
  // Tačni ID-jevi koje provajder vraća u odgovoru (proxy po njima beleži potrošnju).
  ["claude-sonnet-4-5-20250929", "Claude Sonnet 4.5", "Anthropic", "Claude", 3, 15, "200k", [460, 38, 12000], [820, 91, 29000]],
  ["claude-haiku-4-5-20251001", "Claude Haiku 4.5", "Anthropic", "Claude", 1, 5, "200k", [210, 28, 14000], [300, 58, 31000]],
  ["claude-3-5-haiku-20241022", "Claude 3.5 Haiku", "Anthropic", "Claude", 0.8, 4, "200k", [210, 28, 14000], [300, 58, 31000]],
  ["claude-sonnet", "Claude 3.5 Sonnet", "Anthropic", "Claude", 3, 15, "200k", [460, 38, 12000], [820, 91, 29000]],
  ["claude-haiku", "Claude Haiku", "Anthropic", "Claude", 0.8, 4, "200k", [210, 28, 14000], [300, 58, 31000]],
  ["gemini-pro", "Gemini 1.5 Pro", "Google", "Gemini", 1.25, 5, "2M", [510, 30, 7000], [690, 64, 16000]],
  ["gemini-flash", "Gemini Flash", "Google", "Gemini", 0.075, 0.3, "1M", [230, 26, 10000], [330, 55, 24000]],
  ["llama-70b", "Llama 3.1 70B", "Azure", "Llama", 0.9, 0.9, "128k", [540, 34, 5000], [980, 89, 11000]],
];

/** Pravi organizaciju sa katalogom modela i podrazumevanim podešavanjima. Poziva se unutar transakcije. */
export function createOrganization(name, id = `org-${randomBytes(4).toString("hex")}`) {
  db.prepare("INSERT INTO organizations (id, name, proxy_url) VALUES (?,?,?)").run(id, name, publicProxyUrl());
  addDefaultModels(id);
  db.prepare("INSERT INTO alert_rules (org_id) VALUES (?)").run(id);
  db.prepare("INSERT INTO org_settings (org_id) VALUES (?)").run(id);
  return id;
}

/** Dodaje modele iz DEFAULT_MODELS koje organizacija još nema (postojeće cene se ne diraju). */
export function addDefaultModels(orgId) {
  const ins = db.prepare(
    "INSERT OR IGNORE INTO models (org_id, id, name, provider, family, input_price_per_1m, output_price_per_1m, context_window, fleet) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  for (const [mid, mname, provider, family, inp, out, ctx, offPeak, peak] of DEFAULT_MODELS) {
    ins.run(orgId, mid, mname, provider, family, inp, out, ctx, JSON.stringify({ offPeak, peak }));
  }
}

/** Pri startu: i postojeće organizacije dobijaju nove modele iz kataloga. */
export function syncDefaultModels() {
  db.transaction(() => {
    for (const { id } of db.prepare("SELECT id FROM organizations").all()) addDefaultModels(id);
  })();
}
