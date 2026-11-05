import { db } from "../db.js";

/** Osvežava `functions` i `clients` tima na osnovu zabeležene potrošnje. */
export function refreshTeamCatalog(teamId) {
  const fns = db.prepare("SELECT DISTINCT function f FROM usage WHERE team_id = ? ORDER BY f").all(teamId).map((r) => r.f);
  const cls = db.prepare("SELECT DISTINCT client c FROM usage WHERE team_id = ? AND client IS NOT NULL AND client <> '' ORDER BY c").all(teamId).map((r) => r.c);
  db.prepare("UPDATE teams SET functions = ?, clients = ? WHERE id = ?").run(JSON.stringify(fns), JSON.stringify(cls), teamId);
}

export const teamView = (t) => ({ id: t.id, name: t.name, slug: t.slug, functions: JSON.parse(t.functions), clients: JSON.parse(t.clients) });
export const userView = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, teamId: u.team_id ?? null });
export const modelView = (m) => ({
  id: m.id, name: m.name, provider: m.provider, family: m.family,
  inputPricePer1M: m.input_price_per_1m, outputPricePer1M: m.output_price_per_1m,
  contextWindow: m.context_window, lowCost: m.input_price_per_1m <= 0.8,
});
