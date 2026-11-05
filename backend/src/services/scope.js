// Šta korisnik sme da vidi: vođa tima samo svoj tim, ostali celu organizaciju.
// Vraća SQL uslov nad tabelom `usage` (alias u) i parametre.
export function usageScope(user) {
  if (user.role === "lead") return { sql: "u.org_id = ? AND u.team_id = ?", params: [user.org_id, user.team_id ?? ""] };
  return { sql: "u.org_id = ?", params: [user.org_id] };
}

export function scopedTeams(db, user) {
  if (user.role === "lead") return db.prepare("SELECT * FROM teams WHERE org_id = ? AND id = ? ORDER BY rowid").all(user.org_id, user.team_id ?? "");
  return db.prepare("SELECT * FROM teams WHERE org_id = ? ORDER BY rowid").all(user.org_id);
}

// Trošak jednog reda: svoj `cost` (uvoz) ili tokeni × cene modela.
export const COST_SQL = `COALESCE(u.cost, (u.input_tokens * m.input_price_per_1m + u.output_tokens * m.output_price_per_1m) / 1000000.0)`;
export const USAGE_FROM = `usage u JOIN models m ON m.id = u.model AND m.org_id = u.org_id`;
