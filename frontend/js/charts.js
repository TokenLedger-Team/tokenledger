// SVG grafikoni u stilu dizajna (bez spoljnih biblioteka).

import { fmtMoney, fmtDay, fmtCompact, fmtHour, escapeHtml } from "./format.js";
import { t } from "./i18n.js";

/** Glatka linija bez "prebačaja" ispod nule (monotona kubna interpolacija). */
export function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : "";
  const n = pts.length;
  const dx = [], slope = [], tan = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    slope[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  tan[0] = slope[0];
  tan[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tan[i] = tan[i + 1] = 0; continue; }
    const a = tan[i] / slope[i], b = tan[i + 1] / slope[i], h = Math.hypot(a, b);
    if (h > 3) { tan[i] = (3 * a * slope[i]) / h; tan[i + 1] = (3 * b * slope[i]) / h; }
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
    d += ` C${(x0 + h).toFixed(1)} ${(y0 + tan[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - tan[i + 1] * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/** Zaokružen maksimum ose (1, 2, 2.5, 5 × 10^n). */
export function niceMax(value) {
  if (value <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * exp) return step * exp;
  return 10 * exp;
}

/**
 * Pregled troškova: trenutni period (narandžasto) i prethodni (sivo), sa hover tooltipom.
 * current/previous: [{ date, cost }] iste dužine.
 */
export function costChart(container, current, previous) {
  const W = 640, H = 190, PAD = 6;
  const max = niceMax(Math.max(...current.map((p) => p.cost), ...previous.map((p) => p.cost), 0) * 1.08);
  const x = (i) => (current.length === 1 ? W / 2 : (i / (current.length - 1)) * W);
  const y = (v) => PAD + (H - PAD * 2) * (1 - v / max);
  const cur = current.map((p, i) => [x(i), y(p.cost)]);
  const prev = previous.map((p, i) => [x(i), y(p.cost)]);
  const curPath = smoothPath(cur);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => fmtMoney(max * f, { short: true }));

  container.innerHTML = `
    <div class="chart-area">
      <div class="y-labels" aria-hidden="true">${ticks.map((l) => `<span>${l}</span>`).join("")}</div>
      <div class="plot">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(t("dash.dailySpend"))}">
          <defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f47732" stop-opacity=".2"/><stop offset="100%" stop-color="#f47732" stop-opacity="0"/></linearGradient></defs>
          <g class="grid-lines"><path d="${[0, 0.25, 0.5, 0.75, 1].map((f) => `M0 ${y(max * f).toFixed(1)}H${W}`).join("")}"/></g>
          <path class="previous-line" d="${smoothPath(prev)}"/>
          <path class="spend-fill" d="${curPath} L${W} ${H - PAD} L0 ${H - PAD}Z"/>
          <path class="spend-line" d="${curPath}"/>
        </svg>
        <div class="hover-line hidden"></div><div class="hover-dot hidden"></div><div class="chart-tip hidden"></div>
      </div>
    </div>
    <div class="chart-foot"><span>${fmtDay(current[0].date)}</span><span>${t("dash.dailySpend")}</span><span>${fmtDay(current.at(-1).date)}</span></div>`;

  const plot = container.querySelector(".plot");
  const line = plot.querySelector(".hover-line"), dot = plot.querySelector(".hover-dot"), tip = plot.querySelector(".chart-tip");
  const hide = () => [line, dot, tip].forEach((e) => e.classList.add("hidden"));
  const show = (clientX) => {
    const rect = plot.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const i = Math.round(ratio * (current.length - 1));
    const px = (x(i) / W) * rect.width, py = (y(current[i].cost) / H) * rect.height;
    line.style.left = `${px}px`;
    dot.style.left = `${px}px`;
    dot.style.top = `${py}px`;
    tip.innerHTML = `<b>${fmtDay(current[i].date)}</b>
      <span><i class="legend-dot" style="background:var(--orange)"></i>${t("dash.currentSpend")}: ${fmtMoney(current[i].cost)}</span>
      ${previous[i] ? `<span><i class="legend-dot" style="background:var(--gray-mark)"></i>${t("dash.previousPeriod")} (${fmtDay(previous[i].date)}): ${fmtMoney(previous[i].cost)}</span>` : ""}`;
    [line, dot, tip].forEach((e) => e.classList.remove("hidden"));
    const tipW = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, px + 12), rect.width - tipW)}px`;
  };
  plot.addEventListener("mousemove", (e) => show(e.clientX));
  plot.addEventListener("mouseleave", hide);
  plot.addEventListener("touchstart", (e) => show(e.touches[0].clientX), { passive: true });
}

/** Potrošnja po satu: stvarni deo (puna linija + popuna) i projekcija (isprekidano). hours: [{hour, tokens, projected}] */
export function timelineChart(container, hours, { showProjection = true } = {}) {
  const FROM = 6, TO = 22; // prikazuje se radni deo dana; posle 18h je "van radnog vremena"
  const list = hours.filter((h) => h.hour >= FROM && h.hour <= TO);
  const W = 610, H = 194, TOP = 20;
  const max = niceMax(Math.max(...list.map((h) => h.tokens), 1) * 1.1);
  const x = (hour) => 30 + ((hour - FROM) / (TO - FROM)) * (W - 60);
  const y = (v) => TOP + (H - TOP) * (1 - v / max);
  const actual = list.filter((h) => !h.projected);
  const projected = list.filter((h) => h.projected);
  const actualPts = actual.map((h) => [x(h.hour), y(h.tokens)]);
  // Projekcija kreće od poslednje stvarne tačke da linija bude neprekinuta.
  const projPts = (actual.length ? [actual.at(-1)] : []).concat(projected).map((h) => [x(h.hour), y(h.tokens)]);
  const peak = actual.reduce((best, h) => (h.tokens > (best?.tokens ?? -1) ? h : best), null);
  const after = x(18);
  const ticks = [6, 9, 12, 15, 18, 21];

  container.innerHTML = `<svg viewBox="0 -20 ${W} ${H + 60}" role="img" aria-label="${escapeHtml(t("dash.hourly"))}">
    <defs>
      <linearGradient id="timelineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f47732" stop-opacity=".38"/><stop offset="100%" stop-color="#f47732" stop-opacity="0"/></linearGradient>
      <pattern id="nightHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="hatch-a"/><path d="M0 0V7" class="hatch-b" stroke-width="2"/></pattern>
    </defs>
    <rect x="${after}" y="${TOP - 14}" width="${x(TO) - after}" height="${H - TOP + 14}" rx="10" fill="url(#nightHatch)"/>
    ${ticks.map((h) => `<path class="timeline-grid" d="M${x(h)} ${TOP}V${H}"/>`).join("")}
    <path class="timeline-grid" d="${[0, 1 / 3, 2 / 3, 1].map((f) => `M30 ${y(max * f).toFixed(1)}H${W - 30}`).join("")}"/>
    ${actualPts.length > 1 ? `<path class="timeline-area" d="${smoothPath(actualPts)} L${actualPts.at(-1)[0]} ${H} L${actualPts[0][0]} ${H}Z"/>
    <path class="timeline-solid" d="${smoothPath(actualPts)}"/>` : ""}
    ${projPts.length > 1 ? `<path class="timeline-projection" d="${smoothPath(projPts)}" style="opacity:${showProjection ? 1 : 0}"/>` : ""}
    ${peak ? `<line x1="${x(peak.hour)}" y1="${y(peak.tokens)}" x2="${x(peak.hour)}" y2="${H}" class="peak-line"/>
      <circle cx="${x(peak.hour)}" cy="${y(peak.tokens)}" r="7" class="peak-dot"/>
      <g class="peak-tip"><rect x="${x(peak.hour) - 30}" y="${y(peak.tokens) - 40}" width="60" height="24" rx="12"/><text x="${x(peak.hour)}" y="${y(peak.tokens) - 24}" text-anchor="middle">${fmtCompact(peak.tokens)}</text></g>` : ""}
    <text x="30" y="${TOP - 4}" class="tl-sun">☼</text><text x="${W - 30}" y="${TOP - 4}" text-anchor="end" class="tl-moon">☾</text>
    ${ticks.map((h) => `<text x="${x(h)}" y="${H + 30}" text-anchor="middle" class="tl-tick">${escapeHtml(fmtHour(h))}</text>`).join("")}
  </svg>`;
  return peak;
}

/** Polukružni pokazatelj; value je 0-100. */
export function gauge(value) {
  const v = Math.max(0, Math.min(100, value));
  return `<svg viewBox="0 0 260 150" class="gauge" aria-hidden="true">
    <path class="gauge-track" d="M28 136 A102 102 0 0 1 232 136" pathLength="100"/>
    <path class="gauge-value" d="M28 136 A102 102 0 0 1 232 136" pathLength="100" style="stroke-dasharray:${v} 100"/>
  </svg>`;
}
