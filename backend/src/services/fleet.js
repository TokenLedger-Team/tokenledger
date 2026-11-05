import { db } from "../db.js";

const DEFAULT = { offPeak: [400, 30, 5000], peak: [600, 60, 10000] };
const w = ([latencyMs, loadPct, throughputPerMin]) => ({ latencyMs, loadPct, throughputPerMin });

// Mereno na proxyju; dok proxy ne postoji, vrednosti dolaze iz seeda (kolona models.fleet).
export function fleet() {
  return db.prepare("SELECT * FROM models ORDER BY rowid").all().map((m) => {
    const f = m.fleet ? JSON.parse(m.fleet) : DEFAULT;
    return { model: m.id, name: m.name, provider: m.provider, family: m.family, contextWindow: m.context_window, offPeak: w(f.offPeak), peak: w(f.peak) };
  });
}
