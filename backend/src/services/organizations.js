import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { config } from "../config.js";

// Početni katalog modela (USD po 1M tokena, ilustrativne cene, nisu trenutne cene provajdera).
// fleet = [latencija ms, opterećenje %, protok/min] van vrha i u vrhu. Svaka organizacija dobija svoju kopiju.
export const DEFAULT_MODELS = [
  ["gpt-4o", "GPT-4o", "OpenAI", "GPT", 2.5, 10, "128k", [380, 41, 18000], [640, 86, 42000]],
  ["gpt-4o-mini", "GPT-4o mini", "OpenAI", "GPT", 0.15, 0.6, "128k", [190, 30, 22000], [260, 62, 46000]],
  ["gpt-4.1", "GPT-4.1", "OpenAI", "GPT", 2, 8, "1M", [420, 35, 9000], [610, 71, 21000]],
  ["claude-sonnet", "Claude 3.5 Sonnet", "Anthropic", "Claude", 3, 15, "200k", [460, 38, 12000], [820, 91, 29000]],
  ["claude-haiku", "Claude Haiku", "Anthropic", "Claude", 0.8, 4, "200k", [210, 28, 14000], [300, 58, 31000]],
  ["gemini-pro", "Gemini 1.5 Pro", "Google", "Gemini", 1.25, 5, "2M", [510, 30, 7000], [690, 64, 16000]],
  ["gemini-flash", "Gemini Flash", "Google", "Gemini", 0.075, 0.3, "1M", [230, 26, 10000], [330, 55, 24000]],
  ["llama-70b", "Llama 3.1 70B", "Azure", "Llama", 0.9, 0.9, "128k", [540, 34, 5000], [980, 89, 11000]],
];

/** Pravi organizaciju sa katalogom modela i podrazumevanim podešavanjima. Poziva se unutar transakcije. */
export function createOrganization(name, id = `org-${randomBytes(4).toString("hex")}`) {
  db.prepare("INSERT INTO organizations (id, name, proxy_url) VALUES (?,?,?)").run(id, name, config.proxyUrl);
  const ins = db.prepare(
    "INSERT INTO models (org_id, id, name, provider, family, input_price_per_1m, output_price_per_1m, context_window, fleet) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  for (const [mid, mname, provider, family, inp, out, ctx, offPeak, peak] of DEFAULT_MODELS) {
    ins.run(id, mid, mname, provider, family, inp, out, ctx, JSON.stringify({ offPeak, peak }));
  }
  db.prepare("INSERT INTO alert_rules (org_id) VALUES (?)").run(id);
  db.prepare("INSERT INTO org_settings (org_id) VALUES (?)").run(id);
  return id;
}
