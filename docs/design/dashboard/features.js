// Feature modules (F-01 … F-17). Demo data only; everything here is client-side.
(() => {
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const CUR = { USD: 1, EUR: 0.92, RSD: 108 };
let role = "admin", cur = "USD", view = "dashboard", selT = 0, scale = 1;

/* ---------- currency (F-14): converts every "$…" amount in the main area ---------- */
const orig = new WeakMap(), m = n => "$" + Math.round(n).toLocaleString("en-US");
const conv = t => t.replace(/\$([\d,]+(?:\.\d+)?)(k?)/g, (_, n, k) => {
  const v = parseFloat(n.replace(/,/g, "")) * (k ? 1000 : 1) * CUR[cur];
  const s = k && v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "k" : v.toLocaleString("en-US", { maximumFractionDigits: n.includes(".") ? 2 : 0 });
  return cur === "RSD" ? s + " RSD" : (cur === "EUR" ? "€" : "$") + s;
});
function applyCur() {
  const w = document.createTreeWalker($(".main"), NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    if (!orig.has(n)) { if (!/\$\d/.test(n.nodeValue)) continue; orig.set(n, n.nodeValue); }
    n.nodeValue = cur === "USD" ? orig.get(n) : conv(orig.get(n));
  }
}

/* ---------- demo data ---------- */
const TEAMS = [["Support", 6180, 7000], ["Engineering", 7420, 10000], ["Marketing", 3950, 4000], ["Data", 2100, 5000]]; // month to date / limit
const SPLIT_T = [["Support", 2610], ["Engineering", 3140], ["Marketing", 1690], ["Data", 1302]];     // 7-day spend, sums to $8,742
const SPLIT_F = [["Ticket classification", 3120], ["Doc summarization", 2480], ["Chat assistant", 2290], ["Tagging & routing", 852]];
const TOP = [["Support · ticket-bot", 2410], ["Engineering · code-review", 1980], ["Marketing · client Acme", 1320], ["Data · enrichment", 1140]];
const TESTS = [
  { fn: "Ticket classification", team: "Support", n: 200, base: "GPT-4o", cand: "GPT-4o mini", judge: 94, rules: 98, save: 700, lat: [640, 260] },
  { fn: "Doc summarization", team: "Engineering", n: 150, base: "Claude 3.5 Sonnet", cand: "Claude Haiku", judge: 86, rules: 93, save: 520, lat: [820, 300] },
  { fn: "Chat assistant", team: "Support", n: 200, base: "GPT-4o", cand: "GPT-4o mini", judge: 71, rules: 80, save: 0, lat: [640, 260] },
  { fn: "Tagging & routing", team: "Data", n: 300, base: "GPT-4o", cand: "GPT-4o mini", judge: 96, rules: 99, save: 322, lat: [640, 260] }];
// F-10 default rule: judge ≥ 90 and rules ≥ 95 → switch; ≥ 80 → switch with check; otherwise don't switch
const verdict = t => t.judge >= 90 && t.rules >= 95 ? ["ok", "Safe to switch"] : t.judge >= 80 ? ["warn", "Check first"] : ["bad", "Don't switch"];
const PRICES = [["GPT-4o", "OpenAI", 2.5, 10], ["GPT-4o mini", "OpenAI", 0.15, 0.6], ["Claude 3.5 Sonnet", "Anthropic", 3, 15], ["Claude Haiku", "Anthropic", 0.8, 4], ["Gemini 1.5 Pro", "Google", 1.25, 5], ["Gemini Flash", "Google", 0.075, 0.3]];
const NAV = [["dashboard", "Dashboard", "⌂", "F-06"], ["budgets", "Budgets", "▥", "F-07"], ["replay", "Replay & savings", "✧", "F-08–10"], ["insights", "Insights & automation", "⬡", "F-11–17"], ["reports", "Reports & import", "▤", "F-13–14"], ["setup", "Setup & access", "⚙", "F-01–04"], ["prices", "Price table", "$", "F-05"]];
const SUB = { dashboard: "your AI spend at a glance", budgets: "limits and alerts per team", replay: "see where you can pay less", insights: "anomalies, caching, forecast, routing, privacy", reports: "import history, export, currency", setup: "organization, keys and call tags", prices: "model price table" };
const ALLOW = { admin: NAV.map(n => n[0]), lead: ["dashboard", "budgets", "replay", "insights", "reports"], observer: ["dashboard", "budgets", "replay"] };

/* ---------- small builders ---------- */
const head = (k, tier, sub) => `<div class="card-heading"><div><div class="card-kicker">${k}<span class="tier">${tier}</span></div><div class="subheading">${sub}</div></div></div>`;
const chip = (c, t) => `<span class="vchip ${c}">${t}</span>`;
const row = (cols, cells, i = null, sel = false) => `<div class="vrow${sel ? " sel" : ""}" style="--cols:${cols}" ${i === null ? "" : `data-i="${i}"`}>${cells.map(c => `<span>${c}</span>`).join("")}</div>`;
const hrow = (cols, cells) => `<div class="vrow h" style="--cols:${cols}">${cells.map(c => `<span>${c}</span>`).join("")}</div>`;
const bars = l => { const x = Math.max(...l.map(a => a[1])); return l.map(([n, v]) => `<div style="margin:11px 0"><div style="display:flex;justify-content:space-between;font-size:12px"><span>${n}</span><b>${m(v * scale)}</b></div><span class="mm-bar"><i style="width:${v / x * 100}%;background:var(--orange)"></i></span></div>`).join(""); };
const sw = (t, on = true, dis = "") => `<label class="vsw"><input type="checkbox" ${on ? "checked" : ""} ${dis}> ${t}</label>`;
const ro = () => role === "observer" ? "disabled" : "";

/* ---------- dashboard breakdown (F-06) ---------- */
function renderSplits() {
  $("#splits").innerHTML = head("SPEND BREAKDOWN", "F-06", "By team, function and top spenders for the selected period") +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:26px">${[["BY TEAM", SPLIT_T], ["BY FUNCTION", SPLIT_F], ["TOP SPENDERS", TOP]].map(([t, l]) => `<div><div class="card-kicker">${t}</div>${bars(l)}</div>`).join("")}</div>`;
}

/* ---------- views ---------- */
const V = {
  budgets() { // F-07
    const c = "1.1fr 2fr 1.3fr 1fr";
    return `<div class="vgrid"><article class="card">${head("TEAM BUDGETS", "MVP · F-07", "Monthly limit per team · notifications at 80% and 100%")}${hrow(c, ["Team", "Used", "Spent so far", "Status"])}
    ${TEAMS.map(([n, s, l]) => { const p = s / l * 100, st = p >= 100 ? ["bad", "Over limit"] : p >= 80 ? ["warn", "Almost at limit"] : ["ok", "On track"];
      return row(c, [`<b>${n}</b>`, `<span class="mm-bar"><i style="width:${Math.min(p, 100)}%;background:var(--${st[0]})"></i><u class="vmark" style="left:80%"></u></span>`, `${m(s)} / ${m(l)} · ${Math.round(p)}%`, chip(st[0], st[1])]); }).join("")}</article>
    <article class="card h6">${head("ALERT RULES", "MVP · F-07", "Who is notified when a budget is crossed")}${sw("At 80% of budget: email the team lead", true, ro())}${sw("At 100% of budget: email team lead and admins", true, ro())}${sw("At 100%: also post to the team Slack channel", false, ro())}<button class="vbtn" data-act="rules" ${ro()}>Save rules</button></article>
    <article class="card h6">${head("SET A LIMIT", "MVP · F-07", "Per team, per month")}<div class="vform"><label>Team<select>${TEAMS.map(t => `<option>${t[0]}</option>`).join("")}</select></label><label>Monthly limit ($)<input type="number" value="7000" ${ro()}></label><button class="vbtn" data-act="limit" ${ro()}>Update limit</button></div></article></div>`;
  },
  replay() { // F-08, F-09, F-10
    const c = "1.4fr 1.8fr .9fr 1.3fr", t = TESTS[selT], v = verdict(t), tot = TESTS.reduce((a, x) => a + x.save, 0);
    return `<div class="vgrid"><article class="card">${head("REPLAY TESTS & VERDICTS", "MVP · F-08–10", "A sample of real calls is re-sent to a cheaper model and compared")}
    ${hrow(c, ["What", "Switch to", "You save / month", "Verdict"])}
    ${TESTS.map((x, i) => { const vv = verdict(x); return row(c, [`<b>${x.fn}</b>`, x.cand, m(x.save), chip(vv[0], vv[1])], i, i === selT); }).join("")}
    <p class="vnote">Together you could save <b>${m(tot)}</b> a month.</p></article>
    <article class="card h6">${head("SAVINGS REPORT", "MVP · F-09", `${t.fn} · ${t.team}`)}<div style="margin-top:12px">${chip(v[0], v[1])}</div>
    <div class="vtiles"><div class="vtile"><small>Quality vs. now</small><strong>${t.judge}%</strong></div><div class="vtile"><small>Speed</small><strong>${(t.lat[0]/t.lat[1]).toFixed(1)}× faster</strong></div><div class="vtile"><small>You save / month</small><strong>${m(t.save)}</strong></div></div>
    <p class="vnote">${t.base} → ${t.cand}, ${t.n} sampled calls.</p></article>
    <article class="card h6">${head("NEW REPLAY TEST", "MVP · F-08", "Choose a function and a cheaper candidate")}<div class="vform"><label>Function<select>${SPLIT_F.map(f => `<option>${f[0]}</option>`).join("")}</select></label><label>Sample size<input type="number" value="200" min="20" max="1000" ${ro()}></label><label>Candidate<select>${PRICES.map(p => `<option>${p[0]}</option>`).join("")}</select></label><label>Scoring<select><option>Judge model + rules</option><option>Rules only</option></select></label></div><div style="margin-top:14px"><button class="vbtn" data-act="run" ${ro()}>Run replay</button></div></article></div>`;
  },
  insights() { // F-11, F-12, F-15, F-16, F-17
    return `<div class="vgrid"><article class="card h6">${head("ANOMALIES", "NICE-TO-HAVE · F-11", "Spend spikes against the 7-day average")}
    ${row("1fr auto", [`<b>Marketing · client Acme</b><br>3.4× above average on Oct 15`, chip("bad", "Spike")])}${row("1fr auto", [`<b>Support · ticket-bot</b><br>1,240 failed retries in 2 hours`, chip("warn", "Retry loop")])}</article>
    <article class="card h6">${head("REPEATED QUERIES", "NICE-TO-HAVE · F-12", "Identical prompts that a cache could answer")}<div class="vtiles"><div class="vtile"><small>Repeat share</small><strong>18%</strong></div><div class="vtile"><small>Est. saving / mo</small><strong>${m(310)}</strong></div></div><p class="vnote">Largest source: Support FAQ answers.</p></article>
    <article class="card h6">${head("MONTH-END FORECAST", "BONUS · F-15", "Projection from the current daily trend")}<div class="mm-kpi" style="margin-top:12px"><strong>${m(12980)}</strong> <small>of ${m(14000)} total budget</small></div><span class="mm-bar" style="margin-top:12px"><i style="width:93%;background:var(--warn)"></i></span></article>
    <article class="card h6">${head("AUTO-ROUTING RULES", "BONUS · F-16", "Send eligible calls to the cheaper model")}${sw("Ticket classification → GPT-4o mini (when Judge ≥ 90%)", true, ro())}${sw("Tagging & routing → GPT-4o mini (when Judge ≥ 90%)", false, ro())}<p class="vnote">Rules only apply to functions with a "Switch" verdict.</p></article>
    <article class="card">${head("SENSITIVE DATA MASKING", "BONUS · F-17", "PII is masked in stored prompts")}${sw("Mask emails, phone numbers and card numbers before storing prompts", true, role === "admin" ? "" : "disabled")}<p class="vnote">412 values masked in the last 7 days.</p></article></div>`;
  },
  reports() { // F-13, F-14
    const st = (ic, bg, l, v) => `<div class="quick-stat"><span class="stat-icon ${bg}">${ic}</span><div><small>${l}</small><strong>${v}</strong></div></div>`;
    return `<div class="rp"><div class="quick-stats">${st("¤", "orange-bg", "Display currency", cur)}${st("↓", "green-bg", "Last import", "Never")}${st("↑", "yellow-bg", "Last export", "Never")}</div>
    <div class="rp-grid"><article class="card rp-card"><span class="stat-icon green-bg rp-ic">↓</span><div class="card-kicker">IMPORT</div><h2>Bring in past usage</h2><p class="rp-p">Upload a CSV export from your AI provider and we'll add it to your history.</p><label class="drop"><b>Choose a CSV file</b><input type="file" id="csvFile" accept=".csv" ${ro()}></label><button class="vbtn" data-act="import" ${ro()}>Import file</button><p class="vnote">Demo: the file is read in your browser and nothing is stored.</p></article>
    <article class="card rp-card"><span class="stat-icon orange-bg rp-ic">↑</span><div class="card-kicker">EXPORT</div><h2>Download your report</h2><p class="rp-p">Get your spend by team as a spreadsheet, or save it as a PDF. Amounts are shown in <b>${cur}</b>.</p><div class="rp-btns"><button class="vbtn" data-act="csv">Download CSV</button><button class="vbtn ghost" data-act="pdf">Print / save PDF</button></div><p class="vnote">Change the currency (USD, EUR, RSD) in the top bar. Demo rates.</p></article></div></div>`;
  },
  setup() { // F-01, F-02, F-03, F-04
    const stp = (n, t, s) => `<div class="stp"><span class="stp-n">${n}</span><div><div class="stp-t">${t}</div><div class="subheading">${s}</div></div></div>`;
    const flow = `<div class="flow"><span>Your app</span><i>→</i><span class="hl">Token Ledger proxy</span><i>→</i><span>OpenAI · Anthropic · Google</span></div>`;
    const tag = (k, d) => row("1.1fr 2.4fr", [`<b>${k}</b>`, d]);
    return `<div class="vgrid"><article class="card"><div class="card-kicker">HOW IT WORKS</div><h2 class="stp-h">Token Ledger sits between your app and the AI provider</h2><p class="rp-p">Every AI call passes through our proxy. We note which team made it and what it cost, then pass it on unchanged. Setup takes four steps.</p>${flow}</article>
    <article class="card h6">${stp(1, "Connect your AI providers", "Paste one key per provider. Keys are stored encrypted and shown masked.")}${[["OpenAI", "production", "3f9a"], ["Anthropic", "production", "b21c"], ["Google", "staging", "7d04"]].map(k => row("1fr 1fr 1.2fr auto", [`<b>${k[0]}</b>`, k[1], `sk-••••••${k[2]}`, chip("ok", "Encrypted")])).join("")}</article>
    <article class="card h6">${stp(2, "Add your teams", "Costs are grouped by team, so every call needs one.")}${hrow("1.2fr 1fr 1fr", ["Team", "Projects", "Clients"])}${[["Support", 3, 2], ["Engineering", 5, 1], ["Marketing", 2, 4], ["Data", 2, 1]].map(r => row("1.2fr 1fr 1fr", [`<b>${r[0]}</b>`, r[1], r[2]])).join("")}</article>
    <article class="card">${stp(3, "Connect your app", "Point your app at the proxy and add three labels to each call.")}
    <div class="codewrap"><div class="codebar"><span>Paste into your app</span><button class="vbtn ghost" data-act="copy">Copy snippet</button></div><div class="vcode"><span class="ck">base_url:</span>        https://proxy.example.com/v1\n<span class="ck">X-TL-Team:</span>       support\n<span class="ck">X-TL-Function:</span>   ticket-classification\n<span class="ck">X-TL-Client:</span>     acme</div></div>
    <div class="tagleg">${tag("X-TL-Team", "Which team pays for this call")}${tag("X-TL-Function", "What the call is for, e.g. ticket classification")}${tag("X-TL-Client", "Which customer it belongs to (optional)")}</div></article>
    <article class="card">${stp(4, "Decide who can do what", "Pick a role for each person you invite.")}<div class="vtiles rl"><div class="vtile"><strong>Admin</strong><p>Everything: organization, keys, prices, budgets.</p></div><div class="vtile"><strong>Team lead</strong><p>Run savings tests, set alerts, export reports for their teams.</p></div><div class="vtile"><strong>Observer</strong><p>View dashboards, budgets and results. Cannot change anything.</p></div></div></article></div>`;
  },
  prices() { // F-05
    const c = "1.8fr 1fr 1fr", dis = role === "admin" ? "" : "disabled";
    const bub = n => { const q = MODELS.find(x => x.n === n); if (!q) return ""; const col = color(q, 0), lt = col.replace(/(\d+(?:\.\d+)?)%\)$/, (_, v) => (+v + 14) + "%)"); return `<span class="pbub" style="background:radial-gradient(circle at 30% 25%,${lt},${col});box-shadow:0 0 16px hsl(${FAM[q.f].h + q.v * 7} 80% 55% / .38)"></span>`; };
    return `<div class="vgrid"><article class="card">${head("MODEL PRICE TABLE", "", role === "admin" ? "Edit prices; cost is recalculated from these" : "Only admins can edit prices")}${hrow(c, ["Model", "Reading cost ($ per 1M)", "Writing cost ($ per 1M)"])}
    ${PRICES.map(p => row(c, [`<span class="pm">${bub(p[0])}<span><b>${p[0]}</b><small>${p[1]}</small></span></span>`, `<input type="number" step="0.001" value="${p[2]}" ${dis}>`, `<input type="number" step="0.001" value="${p[3]}" ${dis}>`])).join("")}
    <div style="margin-top:16px"><button class="vbtn" data-act="prices" ${dis}>Save prices</button></div><p class="vnote">Demo values, not current provider prices.</p></article></div>`;
  }
};

/* ---------- router ---------- */
function buildNav() {
  $("#mainNav").innerHTML = NAV.map(([id, l, ic, f]) => `<button class="nav-item" data-go="${id}" title="${f}" ${ALLOW[role].includes(id) ? "" : "hidden"}><span class="nav-icon">${ic}</span>${l}</button>`).join("");
}
function go(v) {
  if (!ALLOW[role].includes(v)) v = "dashboard";
  view = v; buildNav();
  $$("#mainNav .nav-item").forEach(b => b.classList.toggle("active", b.dataset.go === v));
  $("[data-view=dashboard]").hidden = v !== "dashboard";
  $("#views").innerHTML = v === "dashboard" ? "" : `<div class="view">${V[v]()}</div>`;
  const label = NAV.find(n => n[0] === v)[1];
  $(".eyebrow").textContent = "MODULES / " + label.toUpperCase();
  $(".topbar h1").innerHTML = `${label} <span class="title-period">— ${SUB[v]}</span>`;
  if (v === "dashboard") renderSplits();
  applyCur();
}
window.go = go;

/* ---------- actions ---------- */
const csv = () => {
  const r = [["team", "spent_" + cur, "limit_" + cur], ...TEAMS.map(t => [t[0], Math.round(t[1] * CUR[cur]), Math.round(t[2] * CUR[cur])])].map(x => x.join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([r], { type: "text/csv" })), download: "token-ledger-report.csv" });
  a.click(); URL.revokeObjectURL(a.href);
};
const ACT = {
  rules: () => notify("Budget alert rules saved (demo)"),
  limit: () => notify("Team limit updated (demo)"),
  run: () => notify("Replay queued: sample re-sent to the candidate model (demo)"),
  prices: () => notify("Price table saved; costs will be recalculated (demo)"),
  csv, pdf: () => window.print(),
  copy: () => { try { navigator.clipboard.writeText($(".vcode").textContent); notify("Snippet copied"); } catch (e) { notify("Copy is not available here"); } },
  import: () => {
    const f = $("#csvFile") && $("#csvFile").files[0];
    if (!f) return notify("Choose a CSV file first");
    const r = new FileReader();
    r.onload = () => notify(`Parsed ${Math.max(0, r.result.split(/\r?\n/).filter(Boolean).length - 1)} rows from ${f.name} (demo, nothing stored)`);
    r.readAsText(f);
  }
};
document.addEventListener("click", e => {
  const g = e.target.closest("[data-go]"), a = e.target.closest("[data-act]"), i = e.target.closest("[data-i]");
  if (g) go(g.dataset.go);
  else if (a && ACT[a.dataset.act]) ACT[a.dataset.act]();
  else if (i && view === "replay") { selT = +i.dataset.i; go("replay"); }
});
$("#role").addEventListener("change", e => { role = e.target.value; go(view); notify(`Role: ${e.target.selectedOptions[0].text}`); });
$("#currency").addEventListener("change", e => { cur = e.target.value; go(view); notify(`Showing amounts in ${cur} (demo rates)`); });
$("#period").addEventListener("change", e => { scale = { 7: 1, 30: 3.5927, 90: 10.653 }[e.target.value]; if (view === "dashboard") renderSplits(); applyCur(); });

go("dashboard");
})();
