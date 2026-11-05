import * as api from "../api.js";
import { startPage } from "../layout.js";
import { t } from "../i18n.js";
import { costChart, timelineChart, gauge } from "../charts.js";
import { fmtMoney, fmtCompact, fmtPct, fmtHour, fmtInt, humanize, escapeHtml, todayISO, addDays, showError } from "../format.js";

const MIX_COLORS = ["var(--orange)", "var(--yellow)", "var(--green)"];
const FAMILY_HUE = { GPT: 162, Claude: 24, Gemini: 215, Llama: 268 };

// Lokalno stanje widgeta (ne zavisi od servera).
const ui = { timelineDate: todayISO(), showProjection: true, peak: 1, selectedModel: null };

startPage({
  id: "dashboard",
  usesPeriod: true,
  async load({ period, user }) {
    const { from, to, prevFrom, prevTo } = period;
    // Prazno stanje samo ako organizacija nema NIJEDAN zapis potrošnje (gleda se ~10 godina unazad,
    // koliko backend dozvoljava), a ne samo u izabranom periodu.
    const allTime = await api.getSummary(addDays(todayISO(), -3650), todayISO());
    if (!allTime.requests && !allTime.totalTokens) return { empty: true, isAdmin: user.role === "admin" };

    const [summary, prevSummary, series, prevSeries, byModel, byTeam, byFunction, byClient, bySource, hourly, fleet, optimization, budgets, replays, models] =
      await Promise.all([
        api.getSummary(from, to),
        api.getSummary(prevFrom, prevTo),
        api.getTimeseries(from, to),
        api.getTimeseries(prevFrom, prevTo),
        api.getBreakdown(from, to, "model"),
        api.getBreakdown(from, to, "team"),
        api.getBreakdown(from, to, "function"),
        api.getBreakdown(from, to, "client"),
        api.getBreakdown(from, to, "source"),
        api.getHourly(ui.timelineDate),
        api.getModelFleet(),
        api.getOptimization(from, to),
        api.getBudgets(),
        api.getReplays(),
        api.getModels(),
      ]);
    return { summary, prevSummary, series, prevSeries, byModel, byTeam, byFunction, byClient, bySource, hourly, fleet, optimization, budgets, replays, models };
  },
  render(root, d, ctx) {
    if (d.empty) return renderEmpty(root, d.isAdmin);
    const recs = d.replays.filter((r) => r.status === "done" && r.verdict !== "dont" && r.savingsPerMonth > 0).sort((a, b) => b.savingsPerMonth - a.savingsPerMonth);
    const potential = recs.reduce((s, r) => s + r.savingsPerMonth, 0);

    root.innerHTML = `
      ${quickStats(d, potential)}
      <section class="dashboard-grid">
        <article class="card span-7">
          <div class="card-heading">
            <div><div class="card-kicker">${t("dash.costOverview")}</div><div class="metric">${fmtMoney(d.summary.totalCost)}</div></div>
            <div class="legend"><span><i class="legend-dot" style="background:var(--orange)"></i>${t("dash.currentSpend")}</span><span><i class="legend-dot" style="background:var(--gray-mark)"></i>${t("dash.previousPeriod")}</span></div>
          </div>
          <div id="costChart"></div>
        </article>
        ${modelMix(d)}
        <article class="card span-7 timeline-card" id="timelineCard"></article>
        <div class="right-stack">
          ${optimizationCard(d.optimization)}
          ${budgetCard(d.budgets, ctx.user)}
        </div>
        ${breakdownCard(d)}
        <article class="card span-12">
          <div class="card-heading"><div><div class="card-kicker">${t("dash.system")}</div><div class="subheading">${t("dash.systemSub")}</div></div></div>
          <div id="modelMap"></div>
        </article>
        ${recommendationCard(recs, potential, d.models)}
      </section>`;

    costChart(root.querySelector("#costChart"), d.series, d.prevSeries);
    renderTimeline(root.querySelector("#timelineCard"), d.hourly);
    renderModelMap(root.querySelector("#modelMap"), d.fleet);
  },
});

// ---------- Prazno stanje (nova organizacija bez poziva) ----------
function renderEmpty(root, isAdmin) {
  root.innerHTML = `<section class="dashboard-grid"><article class="card empty-state">
    <span class="rec-icon" aria-hidden="true">⌁</span>
    <h2>${t("dash.emptyTitle")}</h2>
    <p>${t("dash.emptyText")}</p>
    ${isAdmin ? `<a class="vbtn" href="setup.html#povezivanje">${t("dash.emptyCta")} <span aria-hidden="true">→</span></a>` : ""}
  </article></section>`;
}

// ---------- Brze statistike ----------
function quickStats(d, potential) {
  const change = (cur, prev) => (prev > 0 ? (cur - prev) / prev : null);
  const spendChange = change(d.summary.totalCost, d.prevSummary.totalCost);
  const tokenChange = change(d.summary.totalTokens, d.prevSummary.totalTokens);
  const badge = (c, lowerIsGood) => {
    if (c === null) return "";
    const good = lowerIsGood ? c <= 0 : false;
    const arrow = c > 0 ? "↑" : c < 0 ? "↓" : "";
    return `<span class="stat-change${good ? " good" : ""}" title="${t("dash.vsPrevious")}">${arrow} ${fmtPct(Math.abs(c), 1)}</span>`;
  };
  return `<div class="quick-stats">
    <div class="quick-stat"><span class="stat-icon orange-bg" aria-hidden="true">↗</span><div><small>${t("dash.totalSpend")}</small><strong>${fmtMoney(d.summary.totalCost)}</strong></div>${badge(spendChange, true)}</div>
    <div class="quick-stat"><span class="stat-icon green-bg" aria-hidden="true">⌁</span><div><small>${t("dash.tokensProcessed")}</small><strong>${fmtCompact(d.summary.totalTokens)}</strong></div>${badge(tokenChange, false)}</div>
    <div class="quick-stat"><span class="stat-icon yellow-bg" aria-hidden="true">✧</span><div><small>${t("dash.potentialSavings")}</small><strong>${fmtMoney(potential, { whole: true })}</strong></div>
      <span class="stat-change${potential > 0 ? " good" : ""}">${t(potential > 0 ? "dash.readyToSave" : "dash.nothingToSave")}</span></div>
  </div>`;
}

// ---------- Raspodela modela (po tokenima) ----------
function modelMix(d) {
  const byTokens = [...d.byModel].sort((a, b) => b.tokens - a.tokens);
  const total = byTokens.reduce((s, m) => s + m.tokens, 0) || 1;
  const top = byTokens.slice(0, 3);
  const otherTokens = byTokens.slice(3).reduce((s, m) => s + m.tokens, 0);
  const slices = top.map((m, i) => ({ label: m.label, share: m.tokens / total, color: MIX_COLORS[i] }));
  if (otherTokens > 0) slices.push({ label: t("common.other"), share: otherTokens / total, color: "var(--gray-mark)" });

  let acc = 0;
  const gradient = slices.map((s) => `${s.color} ${(acc * 100).toFixed(2)}% ${((acc += s.share) * 100).toFixed(2)}%`).join(",");
  const lowCostIds = new Set(d.models.filter((m) => m.lowCost).map((m) => m.id));
  const lowShare = d.byModel.filter((m) => lowCostIds.has(m.key)).reduce((s, m) => s + m.tokens, 0) / total;

  return `<article class="card span-5">
    <div class="card-heading"><div><div class="card-kicker">${t("dash.modelMix")}</div><div class="subheading">${t("dash.tokenDistribution")}</div></div>
      <a class="text-button" href="prices.html">${t("dash.priceTable")}</a></div>
    <div class="donut-row">
      <div class="donut" style="background:conic-gradient(${gradient || "var(--track) 0 100%"})" role="img" aria-label="${escapeHtml(slices.map((s) => `${s.label} ${fmtPct(s.share)}`).join(", "))}">
        <div class="donut-hole"><strong style="${fmtCompact(d.summary.totalTokens).length > 6 ? "font-size:17px" : ""}">${fmtCompact(d.summary.totalTokens)}</strong><small>${t("dash.totalTokens")}</small></div>
      </div>
      <div class="donut-legend">${slices.map((s) => `<div><i class="legend-dot" style="background:${s.color}"></i><span>${escapeHtml(s.label)}</span><strong>${fmtPct(s.share)}</strong></div>`).join("")}</div>
    </div>
    <div class="card-bottom-note"><span class="note-icon" aria-hidden="true">↗</span><span>${t("dash.lowCostNote", { pct: fmtPct(lowShare) })}</span></div>
  </article>`;
}

// ---------- Potrošnja po satu ----------
function renderTimeline(card, hourly) {
  const actual = hourly.hours.filter((h) => !h.projected);
  const total = actual.reduce((s, h) => s + h.tokens, 0);
  const isToday = ui.timelineDate === todayISO();
  card.innerHTML = `
    <div class="card-heading"><div><div class="card-kicker">${t("dash.timeline")}</div><div class="subheading">${t("dash.hourly")}</div></div>
      <select class="select-mini" id="timelineDay" aria-label="${t("dash.timeline")}">
        <option value="${todayISO()}"${isToday ? " selected" : ""}>${t("dash.today")}</option>
        <option value="${addDays(todayISO(), -1)}"${isToday ? "" : " selected"}>${t("dash.yesterday")}</option>
      </select></div>
    <div class="timeline-summary"><strong>${fmtCompact(total)} <small>${t("dash.tokens")}</small></strong><span class="peak-label" id="peakLabel"></span></div>
    <div class="timeline-chart" id="timelineChart"></div>
    <div class="timeline-footer">
      <span><i class="legend-dot" style="background:var(--orange)"></i>${t("dash.actualUsage")}</span>
      ${isToday ? `<span><i class="legend-dot dashed"></i>${t("dash.projected")}</span>
      <button type="button" id="timelineToggle">${t(ui.showProjection ? "dash.hideProjection" : "dash.showProjection")}</button>` : ""}
    </div>`;
  const peak = timelineChart(card.querySelector("#timelineChart"), hourly.hours, { showProjection: ui.showProjection });
  card.querySelector("#peakLabel").innerHTML = peak ? `${t("dash.peakUsage")} <b>${escapeHtml(fmtHour(peak.hour))}</b>` : "";

  card.querySelector("#timelineToggle")?.addEventListener("click", () => {
    ui.showProjection = !ui.showProjection;
    renderTimeline(card, hourly);
  });
  card.querySelector("#timelineDay").addEventListener("change", async (e) => {
    ui.timelineDate = e.target.value;
    try {
      renderTimeline(card, await api.getHourly(ui.timelineDate));
    } catch (err) {
      showError(err);
    }
  });
}

// ---------- Ocena optimizacije ----------
function optimizationCard(o) {
  const diff = o.score - o.previousScore;
  return `<article class="card">
    <div class="card-heading"><div><div class="card-kicker">${t("dash.optimization")} <span title="${escapeHtml(t("dash.optimizationInfo"))}" aria-label="${escapeHtml(t("dash.optimizationInfo"))}">ⓘ</span></div>
      <div class="subheading">${t("dash.optimizationSub")}</div></div></div>
    <div class="gauge-body">
      <div class="gauge-wrap">${gauge(o.score)}<div class="gauge-number"><strong>${Math.round(o.score)}<span>%</span></strong></div></div>
      <div class="gauge-side"><span class="mini-status${diff < 0 ? " down" : ""}">${diff >= 0 ? "↗" : "↘"} ${fmtInt(Math.abs(diff) * 10) / 10}%</span>
        <small>${t("dash.vsPrevious")}</small><small class="gauge-cap">${t("dash.optimizedRequests")}</small></div>
    </div>
  </article>`;
}

// ---------- Mesečni budžet ----------
function budgetCard(budgets, user) {
  const withLimit = budgets.filter((b) => b.limit);
  const head = `<div class="card-heading"><div><div class="card-kicker">${t("dash.monthlyBudget")}</div>
    <div class="subheading">${user.role === "lead" && budgets[0] ? t("dash.teamWorkspace", { team: escapeHtml(budgets[0].teamName) }) : t("dash.allTeams")}</div></div>
    <a class="text-button" href="budgets.html">→</a></div>`;
  if (!withLimit.length) return `<article class="card budget-card">${head}<p class="vnote">${t("dash.noBudget")}</p></article>`;

  const limit = withLimit.reduce((s, b) => s + b.limit, 0);
  const spent = withLimit.reduce((s, b) => s + b.spent, 0);
  const daily = withLimit.reduce((s, b) => s + b.dailyAverage, 0);
  const ratio = spent / limit;
  const filled = Math.min(10, ratio > 0 ? Math.max(1, Math.round(ratio * 10)) : 0);
  const now = new Date();
  const daysLeftInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const lastsDays = daily > 0 ? Math.floor((limit - spent) / daily) : Infinity;
  const warning =
    spent >= limit ? t("dash.budgetGone") : lastsDays >= daysLeftInMonth ? t("dash.lastsMonth") : t("dash.lastsDays", { n: lastsDays });

  return `<article class="card budget-card">${head}
    <div class="budget-total"><strong>${fmtMoney(spent, { whole: true })}</strong><span>${t("common.of")} ${fmtMoney(limit, { whole: true })}</span></div>
    <div class="budget-progress" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" aria-label="${t("dash.used", { pct: fmtPct(ratio) })}">
      ${"<span></span>".repeat(filled)}${"<i></i>".repeat(10 - filled)}</div>
    <div class="budget-foot"><span><i class="legend-dot" style="background:var(--orange)"></i>${t("dash.used", { pct: fmtPct(ratio) })}</span>
      <span>${spent <= limit ? t("dash.remaining", { amount: fmtMoney(limit - spent, { whole: true }) }) : t("dash.overBy", { amount: fmtMoney(spent - limit, { whole: true }) })}</span></div>
    <div class="budget-warning"><span aria-hidden="true">↗</span><span>${warning}</span></div>
  </article>`;
}

// ---------- Raspodela potrošnje ----------
function breakdownCard(d) {
  const column = (title, items, label) => {
    const list = items.slice(0, 5);
    const max = Math.max(...list.map((i) => i.cost), 0) || 1;
    return `<div><div class="card-kicker">${title}</div>${
      list.length
        ? list.map((i) => `<div class="split-row"><div><span>${escapeHtml(label(i))}</span><b>${fmtMoney(i.cost, { whole: true })}</b></div>
            <span class="mm-bar" style="margin-top:6px"><i style="width:${(i.cost / max) * 100}%;background:var(--orange)"></i></span></div>`).join("")
        : `<p class="vnote">${t("common.empty")}</p>`
    }</div>`;
  };
  return `<article class="card span-12">
    <div class="card-heading"><div><div class="card-kicker">${t("dash.breakdown")}</div><div class="subheading">${t("dash.breakdownSub")}</div></div></div>
    <div class="splits">
      ${column(t("dash.byTeam"), d.byTeam, (i) => i.label)}
      ${column(t("dash.byFunction"), d.byFunction, (i) => `${i.teamName} · ${humanize(i.label)}`)}
      ${column(t("dash.byClient"), d.byClient, (i) => (i.label ? humanize(i.label) : t("dash.noClient")))}
      ${d.bySource.length ? column(t("dash.bySource"), d.bySource, (i) => t(i.key === "import" ? "dash.sourceImport" : "dash.sourceProxy")) : ""}
    </div>
  </article>`;
}

// ---------- Pregled sistema (mapa modela) ----------
const nodeSize = (throughput) => 26 + 58 * Math.sqrt(throughput / 46000);
const health = (w) => (w.loadPct >= 88 || w.latencyMs >= 900 ? "deg" : w.loadPct >= 80 ? "warn" : "ok");
function nodeColor(m, w, variant) {
  const h = (FAMILY_HUE[m.family] ?? 200) + variant * 7;
  return `hsl(${h} ${health(w) === "deg" ? 38 : 72}% ${34 + w.loadPct * 0.28}%)`;
}

function renderModelMap(el, fleet) {
  const win = ui.peak ? "peak" : "offPeak";
  const families = [...new Set(fleet.map((m) => m.family))];
  const variantOf = (m) => fleet.filter((x) => x.family === m.family).indexOf(m);
  const avg = (key, w) => fleet.reduce((s, m) => s + m[w][key], 0) / fleet.length;
  const latency = avg("latencyMs", win);
  const delta = Math.round((latency / avg("latencyMs", "offPeak") - 1) * 100);
  const throughput = fleet.reduce((s, m) => s + m[win].throughputPerMin, 0);
  const degraded = fleet.filter((m) => health(m[win]) === "deg").length;

  const groups = families.map((f) => {
    const models = fleet.filter((m) => m.family === f);
    return `<div class="mm-group" style="--n:${models.length};--h:${FAMILY_HUE[f] ?? 200}">
      <div class="mm-ghead"><i></i>${escapeHtml(f)}<span>${escapeHtml(models[0].provider)}</span></div>
      <div class="mm-nodes">${models.map((m) => {
        const w = m[win], size = nodeSize(w.throughputPerMin), ghost = nodeSize(m.offPeak.throughputPerMin), c = nodeColor(m, w, variantOf(m));
        const light = c.replace(/(\d+(?:\.\d+)?)%\)$/, (_, v) => `${+v + 14}%)`);
        return `<button class="mm-cell${ui.selectedModel === m.model ? " sel" : ""}" data-m="${escapeHtml(m.model)}" type="button"
            title="${escapeHtml(`${m.name}: ${w.latencyMs} ms · ${w.loadPct}% · ${fmtCompact(w.throughputPerMin)}/min`)}">
          <div class="mm-slot">${ui.peak ? `<span class="mm-ghost" style="width:${ghost}px;height:${ghost}px"></span>` : ""}
            <div class="mm-node ${health(w)}" style="width:${size}px;height:${size}px;--fs:${size > 56 ? 15 : 12}px;background:radial-gradient(circle at 30% 25%,${light},${c});box-shadow:0 0 ${w.loadPct * 0.32}px hsl(${FAMILY_HUE[m.family] ?? 200} 80% 55% / ${w.loadPct / 160})">
              <b>${w.latencyMs}</b><small>ms</small></div></div>
          <span class="mm-name">${escapeHtml(m.name)}</span></button>`;
      }).join("")}</div></div>`;
  }).join("");

  const rows = fleet.map((m) => {
    const w = m[win], s = health(w), c = nodeColor(m, w, variantOf(m));
    const dd = Math.round((m.peak.latencyMs / m.offPeak.latencyMs - 1) * 100);
    return `<div class="mm-row${ui.selectedModel === m.model ? " sel" : ""}" data-m="${escapeHtml(m.model)}">
      <span class="nm"><i style="background:${c}"></i>${escapeHtml(m.name)}</span>
      <span class="mm-lat"><b>${w.latencyMs} ms</b> <span>${ui.peak ? t("dash.offPeakVal", { n: m.offPeak.latencyMs }) : t("dash.peakVal", { n: m.peak.latencyMs })}</span><span class="${dd > 60 ? "d-up" : "d-ok"}">${ui.peak ? "▲" : "+"}${dd}%</span></span>
      <span><span class="mm-bar"><i style="width:${w.loadPct}%;background:${s === "deg" ? "var(--bad)" : s === "warn" ? "var(--warn)" : c}"></i></span></span>
      <span>${fmtCompact(w.throughputPerMin)} /min</span><span>${escapeHtml(m.contextWindow)}</span></div>`;
  }).join("");

  el.innerHTML = `<div class="mm-top"><div class="mm-kpis">
      <div class="mm-kpi"><small>${t("dash.fleetLatency")}</small><strong>${Math.round(latency)} ms</strong><em class="${delta > 20 ? "d-up" : "d-ok"}">${ui.peak ? `+${delta}% ${t("dash.vsOffPeak")}` : t("dash.baseline")}</em></div>
      <div class="mm-kpi"><small>${t("dash.throughput")}</small><strong>${fmtCompact(throughput)} /min</strong></div>
      <div class="mm-kpi"><small>${t("dash.degraded")}</small><strong style="color:${degraded ? "var(--bad)" : "var(--ok)"}">${degraded} / ${fleet.length}</strong></div></div>
    <div class="mm-seg" role="group" aria-label="${t("dash.windowAria")}">
      <button type="button" data-p="0" class="${ui.peak ? "" : "on"}" aria-pressed="${!ui.peak}">${t("dash.offPeak")}<small>02–06 UTC</small></button>
      <button type="button" data-p="1" class="${ui.peak ? "on" : ""}" aria-pressed="${!!ui.peak}">${t("dash.peak")}<small>14–18 UTC</small></button></div></div>
    <div class="mm-stage">${groups}</div>
    <div class="mm-legend"><span><i style="width:14px;height:14px;background:#6b7a99"></i>${t("dash.legendSize")}</span><span><i style="width:10px;height:10px;background:hsl(162 72% 55%)"></i>${t("dash.legendBrightness")}</span>
      <span><i style="width:12px;height:12px;border:1px dashed var(--muted)"></i>${t("dash.legendGhost")}</span>
      <span><i style="width:8px;height:8px;background:var(--ok)"></i><i style="width:8px;height:8px;background:var(--warn)"></i><i style="width:8px;height:8px;background:var(--bad)"></i>${t("dash.legendHealth")}</span></div>
    <div class="mm-table"><div class="mm-row h"><span>${t("dash.colModel")}</span><span>${t("dash.colLatency")}</span><span>${t("dash.colLoad")}</span><span>${t("dash.colThroughput")}</span><span>${t("dash.colContext")}</span></div>${rows}</div>`;

  el.onclick = (e) => {
    const p = e.target.closest("[data-p]"), m = e.target.closest("[data-m]");
    if (p) ui.peak = Number(p.dataset.p);
    else if (m) ui.selectedModel = ui.selectedModel === m.dataset.m ? null : m.dataset.m;
    else return;
    renderModelMap(el, fleet);
  };
}

// ---------- Pametna preporuka ----------
function recommendationCard(recs, potential, models) {
  const name = (id) => models.find((m) => m.id === id)?.name ?? id;
  const body = recs.length
    ? recs.slice(0, 3).map((r) => `<div class="model-switch"><span class="model-badge" aria-hidden="true">✳</span>
        <div><strong>${escapeHtml(name(r.baseModel))} <span class="arrow">→</span> ${escapeHtml(name(r.candidateModel))}</strong>
        <small>${t("dash.recFor", { fn: escapeHtml(`${r.teamName} · ${humanize(r.function)}`) })}</small></div>
        <span class="saving${r.verdict === "check" ? " warn" : ""}">${t(`verdict.${r.verdict}`)} · −${fmtPct(r.savingsPct)}</span></div>`).join("")
    : `<p class="vnote">${t("dash.noRecs")}</p>`;
  return `<article class="card span-12 recommendation-card">
    <div class="recommendation-top"><span class="rec-icon" aria-hidden="true">✧</span>
      <div><div class="card-kicker">${t("dash.recommendation")}</div><h2>${t("dash.recTitle")}</h2><p>${t("dash.recText")}</p></div></div>
    <div class="recommendation-models">${body}
      <div class="saving-summary"><div><small>${t("dash.estSavings")}</small><strong>${fmtMoney(potential, { whole: true })} <span>${t("common.perMonth")}</span></strong></div>
        <a class="vbtn" href="replay.html">${t("dash.openReplay")} <span aria-hidden="true">→</span></a></div>
    </div>
  </article>`;
}
