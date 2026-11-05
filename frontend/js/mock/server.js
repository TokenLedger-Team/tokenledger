// Lažni backend: implementira ISTE rute, ISTE oblike podataka i ISTA pravila
// pristupa kao frontend/API.md. Backend tim ga može čitati kao primer.
//
// - Potrošnja se generiše iz data.js pri svakom učitavanju (deterministički).
// - Sve što korisnik menja (limiti, cene, korisnici, replay testovi...) čuva se u localStorage.

import * as D from "./data.js";
import { addDays, todayISO, parseISODate } from "../format.js";

const STATE_KEY = "tl_mock_state_v2";
const LATENCY_MS = 150;
const REPLAY_DURATION_MS = 6000;

// ---------- Stanje ----------

let usage = null; // generisani dnevni zbirovi (ne čuvaju se)
let state = null; // izmenljivo stanje (čuva se)

function initialState(rows) {
  const teams = D.TEAMS.map((t) => ({ ...t }));
  const from30 = addDays(todayISO(), -29);
  const limits = {};
  for (const t of teams) {
    const spent30 = rows
      .filter((r) => r.teamId === t.id && r.date >= from30)
      .reduce((s, r) => s + costOf(r, D.MODELS), 0);
    limits[t.id] = Math.max(100, Math.round((spent30 * D.LIMIT_FACTOR[t.id]) / 50) * 50);
  }
  const replays = D.REPLAYS.map((r) => ({ ...r, status: "done", createdAt: new Date(Date.now() - 86400000 * 3).toISOString() }));
  return {
    version: 2,
    models: D.MODELS.map((m) => ({ ...m })),
    teams,
    users: D.USERS.map((u) => ({ ...u })),
    providers: structuredClone(D.PROVIDERS),
    limits,
    alertRules: { warnAtPct: 80, emailLeadAtWarn: true, emailAdminsAtLimit: true, slackAtLimit: false },
    replays,
    routingRules: [
      { id: "rr-r1", replayId: "r1", enabled: true },
      { id: "rr-r4", replayId: "r4", enabled: false },
    ],
    privacy: { maskPii: true, maskedLast7Days: 412 },
    imported: [],
    reportStatus: { lastImportAt: null, lastExportAt: null },
    nextId: 100,
  };
}

function load() {
  if (!usage) usage = D.generateUsage(180);
  if (state) return;
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (saved?.version === 2) state = saved;
  } catch {
    // ignorisano, pravi se novo stanje
  }
  if (!state) {
    state = initialState(usage);
    save();
  }
}

function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // bez localStorage-a izmene traju do osvežavanja
  }
}

const nextId = (prefix) => `${prefix}${state.nextId++}`;

// ---------- Obračun ----------

const round2 = (n) => Math.round(n * 100) / 100;
const modelById = (id) => state.models.find((m) => m.id === id);
const teamById = (id) => state.teams.find((t) => t.id === id);

function costOf(row, models = state.models) {
  if (row.cost != null) return row.cost; // uvezeni redovi mogu imati svoj trošak
  const m = models.find((x) => x.id === row.model);
  if (!m) return 0;
  return (row.inputTokens * m.inputPricePer1M + row.outputTokens * m.outputPricePer1M) / 1e6;
}

const allRows = () => usage.concat(state.imported);

/** Šta korisnik sme da vidi: vođa tima samo svoj tim, ostali celu firmu. */
function scopeRows(user) {
  const rows = allRows();
  return user.role === "lead" ? rows.filter((r) => r.teamId === user.teamId) : rows;
}
const scopeTeams = (user) => (user.role === "lead" ? state.teams.filter((t) => t.id === user.teamId) : state.teams);
const inRange = (rows, from, to) => rows.filter((r) => r.date >= from && r.date <= to);

function totals(rows) {
  let cost = 0, inputTokens = 0, outputTokens = 0, requests = 0;
  for (const r of rows) {
    cost += costOf(r);
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    requests += r.requests || 0;
  }
  return { cost: round2(cost), inputTokens, outputTokens, tokens: inputTokens + outputTokens, requests };
}

function monthInfo() {
  const today = todayISO();
  const d = parseISODate(today);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { today, monthStart: today.slice(0, 8) + "01", remainingDays: daysInMonth - d.getDate() };
}

function budgetFor(team) {
  const { today, monthStart, remainingDays } = monthInfo();
  const rows = allRows().filter((r) => r.teamId === team.id);
  const spent = totals(inRange(rows, monthStart, today)).cost;
  // Prosek poslednjih 7 punih dana (bez današnjeg, koji još traje).
  const dailyAverage = round2(totals(inRange(rows, addDays(today, -7), addDays(today, -1))).cost / 7);
  const forecast = round2(spent + dailyAverage * (remainingDays + 1 - dayFractionLeft()));
  const limit = state.limits[team.id] ?? null;
  let status = "none";
  if (limit) {
    if (spent >= limit) status = "over";
    else if (spent >= (limit * state.alertRules.warnAtPct) / 100) status = "almost";
    else if (forecast >= limit) status = "willExceed";
    else status = "ok";
  }
  return { teamId: team.id, teamName: team.name, limit, spent, dailyAverage, forecast, status };
}

function dayFractionLeft() {
  const now = new Date();
  return (now.getHours() + now.getMinutes() / 60) / 24;
}

/** Verdikt (isto pravilo kao u dizajnu, F-10): sudija ≥ 90 i pravila ≥ 95 → prelazak; sudija ≥ 80 → proveri; inače ne. */
function verdictOf(r) {
  if (r.judgeScore >= 90 && r.rulesScore >= 95) return "switch";
  if (r.judgeScore >= 80) return "check";
  return "dont";
}

function replayView(r) {
  // Testovi u toku se "završavaju" posle REPLAY_DURATION_MS.
  if (r.status === "running" && Date.now() - new Date(r.createdAt) > REPLAY_DURATION_MS) finishReplay(r);
  const team = teamById(r.teamId);
  const base = { ...r, teamName: team?.name ?? r.teamId, verdict: null, savingsPerMonth: null, savingsPct: null };
  if (r.status !== "done") return base;
  const verdict = verdictOf(r);
  const { today } = monthInfo();
  const fnRows = inRange(allRows(), addDays(today, -30), addDays(today, -1)).filter(
    (x) => x.teamId === r.teamId && x.function === r.function && x.model === r.baseModel
  );
  const now = fnRows.reduce((s, x) => s + costOf(x), 0);
  const withCandidate = fnRows.reduce((s, x) => s + costOf({ ...x, model: r.candidateModel, cost: null }), 0);
  const saved = Math.max(0, now - withCandidate);
  return {
    ...base,
    verdict,
    savingsPerMonth: verdict === "dont" ? 0 : round2(saved),
    savingsPct: now > 0 ? round2(saved / now) : 0,
  };
}

function finishReplay(r) {
  // Ocene su pseudo-slučajne, ali stabilne za isti par funkcija/kandidat.
  let h = 0;
  for (const ch of r.function + r.candidateModel) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  r.judgeScore = 72 + (h % 27);
  r.rulesScore = r.scoring === "rules" ? 85 + (h % 15) : 80 + ((h >> 3) % 20);
  r.baseLatencyMs = D.FLEET[r.baseModel]?.peak[0] ?? 600;
  r.candidateLatencyMs = D.FLEET[r.candidateModel]?.peak[0] ?? 400;
  r.status = "done";
  if (verdictOf(r) === "switch" && !state.routingRules.some((x) => x.replayId === r.id)) {
    state.routingRules.push({ id: `rr-${r.id}`, replayId: r.id, enabled: false });
  }
  save();
}

// ---------- Pomoćno za rute ----------

const ok = (data, status = 200) => ({ status, data });
const fail = (status, message) => ({ status, data: { message } });
const MSG = {
  sr: {
    login: "Pogrešan email ili lozinka.",
    session: "Sesija je istekla, prijavi se ponovo.",
    forbidden: "Tvoja uloga nema pravo na ovu akciju.",
    range: "Parametri from i to su obavezni (YYYY-MM-DD).",
    notFound: "Ne postoji.",
    exists: "Već postoji.",
    invalid: "Neispravni podaci.",
    google: "Google prijava radi tek sa pravim backendom.",
  },
  en: {
    login: "Wrong email or password.",
    session: "Your session expired, please log in again.",
    forbidden: "Your role is not allowed to do this.",
    range: "Parameters from and to are required (YYYY-MM-DD).",
    notFound: "Not found.",
    exists: "Already exists.",
    invalid: "Invalid data.",
    google: "Google sign-in works only with the real backend.",
  },
};

function currentUser(token) {
  const id = token?.startsWith("mock-token-") ? token.slice("mock-token-".length) : null;
  return state.users.find((u) => u.id === id) || null;
}

function slugify(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "dj").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---------- Rute ----------
// Svaka ruta: [metod, regex, handler(ctx)] gde je ctx = { user, query, body, params, m (poruke) }.
// `public: true` znači da ne traži token.

const routes = [
  // ----- Auth -----
  { method: "POST", path: /^\/auth\/login$/, public: true, handler: ({ body, m }) => {
    const user = state.users.find((u) => u.email.toLowerCase() === String(body?.email || "").trim().toLowerCase());
    if (!user || !body?.password) return fail(401, m.login);
    return ok({ token: `mock-token-${user.id}`, user });
  } },
  { method: "POST", path: /^\/auth\/signup$/, public: true, handler: ({ body, m }) => {
    const email = String(body?.email || "").trim();
    if (!body?.name || !email || !body?.password || !body?.company) return fail(400, m.invalid);
    if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return fail(409, m.exists);
    // Pravi backend pravi novu organizaciju; mock ima samo jednu, pa korisnika dodaje u nju kao administratora.
    const user = { id: nextId("u"), name: body.name.trim(), email, role: "admin", teamId: null };
    state.users.push(user);
    save();
    return ok({ token: `mock-token-${user.id}`, user }, 201);
  } },
  { method: "POST", path: /^\/auth\/forgot-password$/, public: true, handler: () => ok({ ok: true }) },
  { method: "GET", path: /^\/auth\/google$/, public: true, handler: ({ m }) => fail(501, m.google) },
  { method: "POST", path: /^\/auth\/logout$/, handler: () => ok(null, 204) },
  { method: "GET", path: /^\/auth\/me$/, handler: ({ user }) => ok(user) },

  // ----- Organizacija, valute, provajderi, proxy -----
  { method: "GET", path: /^\/org$/, handler: () => ok(D.ORG) },
  { method: "GET", path: /^\/currencies$/, handler: () => ok({ ...D.CURRENCIES, updatedAt: new Date().toISOString() }) },
  { method: "GET", path: /^\/providers$/, handler: () =>
    ok(state.providers.map((p) => ({ ...p, connected: p.keys.some((k) => k.environment === "production") }))) },
  { method: "POST", path: /^\/providers\/([^/]+)\/keys$/, handler: ({ user, params, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const provider = state.providers.find((p) => p.id === params[0]);
    const apiKey = String(body?.apiKey || "").trim();
    if (!provider) return fail(404, m.notFound);
    if (apiKey.length < 8) return fail(400, m.invalid);
    // Pravi backend šifruje ključ i NIKAD ga ne vraća; frontend dobija samo poslednja 4 znaka.
    const key = { id: nextId("k"), environment: body.environment || "production", last4: apiKey.slice(-4) };
    provider.keys = provider.keys.filter((k) => k.environment !== key.environment).concat(key);
    save();
    return ok(key, 201);
  } },
  { method: "DELETE", path: /^\/providers\/([^/]+)\/keys\/([^/]+)$/, handler: ({ user, params, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const provider = state.providers.find((p) => p.id === params[0]);
    if (!provider) return fail(404, m.notFound);
    provider.keys = provider.keys.filter((k) => k.id !== params[1]);
    save();
    return ok(null, 204);
  } },
  // Proxy ključevi (tl_...): pun ključ se vraća samo pri pravljenju, posle samo last4.
  { method: "GET", path: /^\/proxy-keys$/, handler: ({ user, m }) =>
    user.role !== "admin" ? fail(403, m.forbidden) : ok((state.proxyKeys ??= [])) },
  { method: "POST", path: /^\/proxy-keys$/, handler: ({ user, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const name = String(body?.name || "").trim();
    if (!name || name.length > 80) return fail(400, m.invalid);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = "tl_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const view = { id: nextId("pk"), name, last4: key.slice(-4), createdAt: new Date().toISOString() };
    (state.proxyKeys ??= []).push(view);
    save();
    return ok({ ...view, key }, 201);
  } },
  { method: "DELETE", path: /^\/proxy-keys\/([^/]+)$/, handler: ({ user, params, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    state.proxyKeys = (state.proxyKeys ?? []).filter((k) => k.id !== params[0]);
    save();
    return ok(null, 204);
  } },
  { method: "GET", path: /^\/proxy\/status$/, handler: () =>
    ok({ healthy: true, lastCallAt: new Date(Date.now() - 12000).toISOString() }) },

  // ----- Statistika -----
  { method: "GET", path: /^\/stats\/summary$/, handler: ({ user, query, m }) => {
    if (!query.from || !query.to) return fail(400, m.range);
    const t = totals(inRange(scopeRows(user), query.from, query.to));
    return ok({ from: query.from, to: query.to, totalCost: t.cost, totalTokens: t.tokens, inputTokens: t.inputTokens, outputTokens: t.outputTokens, requests: t.requests });
  } },
  { method: "GET", path: /^\/stats\/timeseries$/, handler: ({ user, query, m }) => {
    if (!query.from || !query.to) return fail(400, m.range);
    const byDay = new Map();
    for (const r of inRange(scopeRows(user), query.from, query.to)) {
      const d = byDay.get(r.date) || { cost: 0, tokens: 0, requests: 0 };
      d.cost += costOf(r);
      d.tokens += r.inputTokens + r.outputTokens;
      d.requests += r.requests || 0;
      byDay.set(r.date, d);
    }
    const out = [];
    for (let d = query.from; d <= query.to; d = addDays(d, 1)) {
      const v = byDay.get(d) || { cost: 0, tokens: 0, requests: 0 };
      out.push({ date: d, cost: round2(v.cost), tokens: v.tokens, requests: v.requests });
    }
    return ok(out);
  } },
  { method: "GET", path: /^\/stats\/breakdown$/, handler: ({ user, query, m }) => {
    if (!query.from || !query.to) return fail(400, m.range);
    const by = query.by;
    if (!["team", "function", "client", "model"].includes(by)) return fail(400, m.invalid);
    const groups = new Map();
    for (const r of inRange(scopeRows(user), query.from, query.to)) {
      const key = by === "team" ? r.teamId : by === "function" ? `${r.teamId}:${r.function}` : by === "client" ? r.client || "" : r.model;
      const g = groups.get(key) || { key, cost: 0, tokens: 0, requests: 0, teamId: by === "function" ? r.teamId : undefined };
      g.cost += costOf(r);
      g.tokens += r.inputTokens + r.outputTokens;
      g.requests += r.requests || 0;
      groups.set(key, g);
    }
    const label = (g) => {
      if (by === "team") return teamById(g.key)?.name ?? g.key;
      if (by === "function") return g.key.split(":")[1];
      if (by === "client") return g.key || null;
      return modelById(g.key)?.name ?? g.key;
    };
    return ok([...groups.values()].map((g) => ({ ...g, label: label(g), teamName: g.teamId ? teamById(g.teamId)?.name : undefined, cost: round2(g.cost) })).sort((a, b) => b.cost - a.cost));
  } },
  { method: "GET", path: /^\/stats\/hourly$/, handler: ({ user, query }) => {
    const date = query.date || todayISO();
    const isToday = date === todayISO();
    const nowHour = new Date().getHours();
    const sum = (d) => totals(inRange(scopeRows(user), d, d)).tokens;
    const curveTotal = D.HOUR_CURVE.reduce((a, b) => a + b, 0);
    const doneShare = D.HOUR_CURVE.slice(0, nowHour).reduce((a, b) => a + b, 0) / curveTotal;
    // Za danas: stvarni sati do sada, a projekcija za ostatak dana prema jučerašnjem obrascu.
    const dayTotal = isToday ? (doneShare ? sum(date) / doneShare : sum(addDays(date, -1))) : sum(date);
    const hours = D.HOUR_CURVE.map((w, hour) => ({
      hour,
      tokens: Math.round((dayTotal * w) / curveTotal),
      projected: isToday && hour >= nowHour,
    }));
    return ok({ date, hours });
  } },
  { method: "GET", path: /^\/stats\/models$/, handler: () =>
    ok(state.models.map((mm) => {
      const f = D.FLEET[mm.id] || { offPeak: [400, 30, 5000], peak: [600, 60, 10000] };
      const w = ([latencyMs, loadPct, throughputPerMin]) => ({ latencyMs, loadPct, throughputPerMin });
      return { model: mm.id, name: mm.name, provider: mm.provider, family: mm.family, contextWindow: mm.contextWindow, offPeak: w(f.offPeak), peak: w(f.peak) };
    })) },
  { method: "GET", path: /^\/stats\/optimization$/, handler: ({ user, query, m }) => {
    if (!query.from || !query.to) return fail(400, m.range);
    // Neoptimizovan zahtev = funkcija ima replay sa verdiktom switch/check, a rutiranje za nju nije uključeno.
    const flagged = state.replays.map(replayView).filter((r) => r.status === "done" && r.verdict !== "dont");
    const covered = (r) => state.routingRules.some((x) => x.enabled && x.replayId === r.id);
    const score = (rows) => {
      const total = rows.reduce((s, r) => s + (r.requests || 0), 0);
      const bad = rows
        .filter((r) => flagged.some((f) => !covered(f) && f.teamId === r.teamId && f.function === r.function && f.baseModel === r.model))
        .reduce((s, r) => s + (r.requests || 0), 0);
      return total ? round2((1 - bad / total) * 100) : 100;
    };
    const current = score(inRange(scopeRows(user), query.from, query.to));
    // Mock pojednostavljenje: za prethodni period se samo glumi niža ocena.
    const previous = Math.max(0, round2(current - 9.6));
    return ok({ score: current, previousScore: previous });
  } },

  // ----- Budžeti -----
  { method: "GET", path: /^\/budgets$/, handler: ({ user }) => ok(scopeTeams(user).map(budgetFor)) },
  { method: "PUT", path: /^\/budgets\/([^/]+)$/, handler: ({ user, params, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const team = teamById(params[0]);
    const limit = Number(body?.limit);
    if (!team) return fail(404, m.notFound);
    if (!(limit > 0)) return fail(400, m.invalid);
    state.limits[team.id] = round2(limit);
    save();
    return ok(budgetFor(team));
  } },
  { method: "GET", path: /^\/alert-rules$/, handler: () => ok(state.alertRules) },
  { method: "PUT", path: /^\/alert-rules$/, handler: ({ user, body, m }) => {
    if (user.role === "observer") return fail(403, m.forbidden);
    const pct = Number(body?.warnAtPct ?? state.alertRules.warnAtPct);
    if (!(pct >= 1 && pct <= 100)) return fail(400, m.invalid);
    state.alertRules = {
      warnAtPct: pct,
      emailLeadAtWarn: !!body.emailLeadAtWarn,
      emailAdminsAtLimit: !!body.emailAdminsAtLimit,
      slackAtLimit: !!body.slackAtLimit,
    };
    save();
    return ok(state.alertRules);
  } },

  // ----- Replay -----
  { method: "GET", path: /^\/replays$/, handler: ({ user }) => {
    const list = state.replays.filter((r) => user.role !== "lead" || r.teamId === user.teamId).map(replayView);
    return ok(list.sort((a, b) => (b.savingsPerMonth ?? -1) - (a.savingsPerMonth ?? -1)));
  } },
  { method: "POST", path: /^\/replays$/, handler: ({ user, body, m }) => {
    if (user.role === "observer") return fail(403, m.forbidden);
    if (user.role === "lead" && body?.teamId !== user.teamId) return fail(403, m.forbidden);
    const sampleSize = Number(body?.sampleSize);
    const rows = allRows().filter((r) => r.teamId === body?.teamId && r.function === body?.function);
    if (!rows.length || !modelById(body?.candidateModel) || !(sampleSize >= 20 && sampleSize <= 1000)) return fail(400, m.invalid);
    // Bazni model = model koji ta funkcija trenutno najviše koristi.
    const byModel = {};
    rows.forEach((r) => (byModel[r.model] = (byModel[r.model] || 0) + (r.requests || 0)));
    const baseModel = Object.entries(byModel).sort((a, b) => b[1] - a[1])[0][0];
    const replay = {
      id: nextId("r"),
      teamId: body.teamId,
      function: body.function,
      sampleSize,
      baseModel,
      candidateModel: body.candidateModel,
      scoring: body.scoring === "rules" ? "rules" : "judge_rules",
      judgeScore: null,
      rulesScore: null,
      baseLatencyMs: null,
      candidateLatencyMs: null,
      status: "running",
      createdAt: new Date().toISOString(),
    };
    state.replays.push(replay);
    save();
    return ok(replayView(replay), 201);
  } },

  // ----- Uvidi -----
  { method: "GET", path: /^\/insights\/anomalies$/, handler: ({ user }) => {
    const rows = scopeRows(user);
    const today = todayISO();
    const out = [];
    // Skok: dnevni trošak funkcije > 2.5× proseka prethodnih 7 dana (gleda poslednjih 7 punih dana).
    const keys = [...new Set(rows.map((r) => `${r.teamId}|${r.function}|${r.client || ""}`))];
    for (const key of keys) {
      const [teamId, fn, client] = key.split("|");
      const daily = (d) => rows.filter((r) => r.date === d && r.teamId === teamId && r.function === fn).reduce((s, r) => s + costOf(r), 0);
      for (let i = 1; i <= 7; i++) {
        const d = addDays(today, -i);
        let base = 0;
        for (let k = 1; k <= 7; k++) base += daily(addDays(d, -k));
        base /= 7;
        const value = daily(d);
        if (base > 0 && value / base > 2.5) {
          out.push({ id: `an-${key}-${d}`, type: "spike", teamId, teamName: teamById(teamId)?.name, function: fn, client: client || null, date: d, factor: round2(value / base), detectedAt: new Date().toISOString() });
        }
      }
    }
    if (user.role !== "lead" || user.teamId === "t-support") {
      out.push({ id: "an-retry", type: "retry", teamId: "t-support", teamName: "Support", function: "ticket-classification", client: null, failedRetries: 1240, hours: 2, detectedAt: new Date(Date.now() - 5400000).toISOString() });
    }
    return ok(out);
  } },
  { method: "GET", path: /^\/insights\/cache$/, handler: ({ user }) => {
    const { today } = monthInfo();
    const last30 = totals(inRange(scopeRows(user), addDays(today, -30), addDays(today, -1))).cost;
    return ok({ repeatShare: 0.18, estMonthlySavings: round2(last30 * 0.18 * 0.35), largestSource: { teamName: "Support", function: "faq-answers" } });
  } },
  { method: "GET", path: /^\/insights\/forecast$/, handler: ({ user }) => {
    const budgets = scopeTeams(user).map(budgetFor);
    return ok({ month: todayISO().slice(0, 7), projected: round2(budgets.reduce((s, b) => s + b.forecast, 0)), budget: round2(budgets.reduce((s, b) => s + (b.limit || 0), 0)) });
  } },
  { method: "GET", path: /^\/routing-rules$/, handler: ({ user }) => {
    const list = state.routingRules
      .map((rule) => {
        const r = state.replays.find((x) => x.id === rule.replayId);
        if (!r) return null;
        return { id: rule.id, replayId: r.id, teamId: r.teamId, teamName: teamById(r.teamId)?.name, function: r.function, fromModel: r.baseModel, toModel: r.candidateModel, minJudgeScore: 90, enabled: rule.enabled };
      })
      .filter((x) => x && (user.role !== "lead" || x.teamId === user.teamId));
    return ok(list);
  } },
  { method: "PUT", path: /^\/routing-rules\/([^/]+)$/, handler: ({ user, params, body, m }) => {
    const rule = state.routingRules.find((x) => x.id === params[0]);
    const replay = rule && state.replays.find((x) => x.id === rule.replayId);
    if (!rule || !replay) return fail(404, m.notFound);
    if (user.role === "observer" || (user.role === "lead" && replay.teamId !== user.teamId)) return fail(403, m.forbidden);
    rule.enabled = !!body?.enabled;
    save();
    return ok({ id: rule.id, enabled: rule.enabled });
  } },
  { method: "GET", path: /^\/settings\/privacy$/, handler: () => ok(state.privacy) },
  { method: "PUT", path: /^\/settings\/privacy$/, handler: ({ user, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    state.privacy.maskPii = !!body?.maskPii;
    save();
    return ok(state.privacy);
  } },

  // ----- Izveštaji i uvoz -----
  { method: "GET", path: /^\/reports\/status$/, handler: () => ok(state.reportStatus) },
  { method: "POST", path: /^\/reports\/exports$/, handler: () => {
    state.reportStatus.lastExportAt = new Date().toISOString();
    save();
    return ok(state.reportStatus, 201);
  } },
  { method: "POST", path: /^\/usage\/import$/, handler: ({ user, body, m }) => {
    if (user.role === "observer") return fail(403, m.forbidden);
    const rows = Array.isArray(body?.rows) ? body.rows : null;
    if (!rows) return fail(400, m.invalid);
    const errors = [];
    let imported = 0;
    rows.forEach((row, i) => {
      const team = state.teams.find((t) => t.slug === row.team || t.name.toLowerCase() === String(row.team || "").toLowerCase());
      const model = state.models.find((x) => x.id === row.model || x.name.toLowerCase() === String(row.model || "").toLowerCase());
      const valid = /^\d{4}-\d{2}-\d{2}$/.test(row.date) && team && model && row.function && Number(row.inputTokens) >= 0 && Number(row.outputTokens) >= 0;
      if (!valid || (user.role === "lead" && team.id !== user.teamId)) {
        errors.push({ row: i + 1, message: m.invalid });
        return;
      }
      state.imported.push({
        date: row.date,
        teamId: team.id,
        function: slugify(row.function),
        client: row.client ? slugify(row.client) : null,
        model: model.id,
        requests: Number(row.requests) || 0,
        inputTokens: Number(row.inputTokens),
        outputTokens: Number(row.outputTokens),
        cost: row.cost === undefined || row.cost === null || row.cost === "" ? null : Number(row.cost),
        source: "import",
      });
      imported++;
    });
    state.reportStatus.lastImportAt = new Date().toISOString();
    save();
    return ok({ imported, skipped: errors.length, errors: errors.slice(0, 20) }, 201);
  } },

  // ----- Timovi i korisnici -----
  { method: "GET", path: /^\/teams$/, handler: ({ user }) =>
    ok(scopeTeams(user).map((t) => {
      const rows = allRows().filter((r) => r.teamId === t.id);
      return { ...t, functions: [...new Set(rows.map((r) => r.function))].sort(), clients: [...new Set(rows.map((r) => r.client).filter(Boolean))].sort() };
    })) },
  { method: "POST", path: /^\/teams$/, handler: ({ user, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const name = String(body?.name || "").trim();
    const slug = slugify(name);
    if (!name || !slug) return fail(400, m.invalid);
    if (state.teams.some((t) => t.slug === slug)) return fail(409, m.exists);
    const team = { id: nextId("t-"), name, slug };
    state.teams.push(team);
    save();
    return ok({ ...team, functions: [], clients: [] }, 201);
  } },
  { method: "GET", path: /^\/users$/, handler: ({ user, m }) => (user.role === "admin" ? ok(state.users) : fail(403, m.forbidden)) },
  { method: "POST", path: /^\/users$/, handler: ({ user, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const email = String(body?.email || "").trim();
    if (!body?.name || !/^\S+@\S+\.\S+$/.test(email) || !["admin", "lead", "observer"].includes(body.role)) return fail(400, m.invalid);
    if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) return fail(409, m.exists);
    const created = { id: nextId("u"), name: String(body.name).trim(), email, role: body.role, teamId: body.teamId || null };
    state.users.push(created);
    save();
    return ok(created, 201);
  } },
  { method: "PUT", path: /^\/users\/([^/]+)$/, handler: ({ user, params, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const target = state.users.find((u) => u.id === params[0]);
    if (!target) return fail(404, m.notFound);
    if (body?.role !== undefined && !["admin", "lead", "observer"].includes(body.role)) return fail(400, m.invalid);
    for (const k of ["name", "role", "teamId"]) if (body?.[k] !== undefined) target[k] = body[k] || null;
    save();
    return ok(target);
  } },
  { method: "DELETE", path: /^\/users\/([^/]+)$/, handler: ({ user, params, m }) => {
    if (user.role !== "admin" || params[0] === user.id) return fail(403, m.forbidden);
    state.users = state.users.filter((u) => u.id !== params[0]);
    save();
    return ok(null, 204);
  } },

  // ----- Modeli i cene -----
  { method: "GET", path: /^\/models$/, handler: () =>
    ok(state.models.map((mm) => ({ ...mm, lowCost: mm.inputPricePer1M <= 0.8 }))) },
  { method: "PUT", path: /^\/models\/([^/]+)$/, handler: ({ user, params, body, m }) => {
    if (user.role !== "admin") return fail(403, m.forbidden);
    const model = modelById(params[0]);
    const input = Number(body?.inputPricePer1M);
    const output = Number(body?.outputPricePer1M);
    if (!model) return fail(404, m.notFound);
    if (!(input >= 0) || !(output >= 0)) return fail(400, m.invalid);
    model.inputPricePer1M = input;
    model.outputPricePer1M = output;
    save();
    return ok({ ...model, lowCost: model.inputPricePer1M <= 0.8 });
  } },
];

export async function mockRequest(method, path, { query = {}, body, token, lang = "sr" } = {}) {
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  load();
  const m = MSG[lang] || MSG.sr;
  for (const route of routes) {
    const match = route.method === method && path.match(route.path);
    if (!match) continue;
    const user = route.public ? null : currentUser(token);
    if (!route.public && !user) return fail(401, m.session);
    const result = route.handler({ user, query, body, params: match.slice(1), m });
    return { status: result.status, data: structuredClone(result.data) };
  }
  return fail(404, `Mock: ${method} ${path}`);
}

/** Vraća demo na početno stanje. Iz konzole: (await import("./js/mock/server.js")).resetMock() */
export function resetMock() {
  state = null;
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // ignorisano
  }
}
