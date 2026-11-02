import * as api from "../api.js";
import { startPage } from "../layout.js";
import { can } from "../auth.js";
import { t } from "../i18n.js";
import { head, chip, row, toggle, readOnlyNote } from "../ui.js";
import { fmtMoney, fmtPct, fmtInt, fmtDay, humanize, escapeHtml, toast, showError } from "../format.js";

startPage({
  id: "insights",
  async load() {
    const [anomalies, cache, forecast, routing, privacy, models] = await Promise.all([
      api.getAnomalies(), api.getCacheStats(), api.getForecast(), api.getRoutingRules(), api.getPrivacy(), api.getModels(),
    ]);
    return { anomalies, cache, forecast, routing, privacy, models };
  },
  render(root, { anomalies, cache, forecast, routing, privacy, models }, ctx) {
    const name = (id) => models.find((m) => m.id === id)?.name ?? id;
    const canRoute = can.editRouting(ctx.user);
    const canPrivacy = can.editPrivacy(ctx.user);
    const ratio = forecast.budget ? forecast.projected / forecast.budget : 0;
    const forecastColor = ratio >= 1 ? "var(--bad)" : ratio >= 0.8 ? "var(--warn)" : "var(--ok)";

    const anomalyRow = (a) => {
      const who = `<b>${escapeHtml(`${a.teamName} · ${humanize(a.client ? `client ${a.client}` : a.function)}`)}</b>`;
      return a.type === "spike"
        ? row("1fr auto", [`${who}<br>${t("in.spikeText", { x: a.factor.toFixed(1), date: fmtDay(a.date) })}`, chip("bad", t("in.spike"))])
        : row("1fr auto", [`${who}<br>${t("in.retryText", { n: fmtInt(a.failedRetries), h: a.hours })}`, chip("warn", t("in.retryLoop"))]);
    };

    root.innerHTML = `<div class="views"><div class="vgrid">
      <article class="card h6">${head(t("in.anomalies"), t("in.anomaliesSub"))}
        ${anomalies.length ? anomalies.map(anomalyRow).join("") : `<p class="vnote">${t("in.noAnomalies")}</p>`}</article>

      <article class="card h6">${head(t("in.repeated"), t("in.repeatedSub"))}
        <div class="vtiles"><div class="vtile"><small>${t("in.repeatShare")}</small><strong>${fmtPct(cache.repeatShare)}</strong></div>
          <div class="vtile"><small>${t("in.estSaving")}</small><strong>${fmtMoney(cache.estMonthlySavings, { whole: true })}</strong></div></div>
        ${cache.largestSource ? `<p class="vnote">${escapeHtml(t("in.largestSource", { src: `${cache.largestSource.teamName} · ${humanize(cache.largestSource.function)}` }))}</p>` : ""}</article>

      <article class="card h6">${head(t("in.forecast"), t("in.forecastSub"))}
        <div class="mm-kpi" style="margin-top:12px"><strong>${fmtMoney(forecast.projected, { whole: true })}</strong>
          <small style="display:inline;text-transform:none;letter-spacing:0;margin-left:6px">${t("in.ofBudget", { amount: fmtMoney(forecast.budget, { whole: true }) })}</small></div>
        <span class="mm-bar" style="margin-top:12px" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" aria-label="${t("in.forecast")}">
          <i style="width:${Math.min(ratio, 1) * 100}%;background:${forecastColor}"></i></span>
        <p class="vnote">${fmtPct(ratio)}</p></article>

      <article class="card h6">${head(t("in.routing"), t("in.routingSub"))}
        ${routing.length ? routing.map((r) => toggle(`route-${r.id}`, escapeHtml(t("in.routingRule", { fn: `${r.teamName} · ${humanize(r.function)}`, model: name(r.toModel), n: r.minJudgeScore })), r.enabled, !canRoute)).join("") : `<p class="vnote">${t("in.noRouting")}</p>`}
        <p class="vnote">${t("in.routingNote")}</p>${readOnlyNote(canRoute)}</article>

      <article class="card">${head(t("in.masking"), t("in.maskingSub"))}
        ${toggle("maskPii", t("in.maskToggle"), privacy.maskPii, !canPrivacy)}
        <p class="vnote">${t("in.maskedCount", { n: fmtInt(privacy.maskedLast7Days) })}</p>${readOnlyNote(canPrivacy)}</article>
    </div></div>`;

    // Prekidači se čuvaju odmah; ako server odbije, vraćamo prekidač nazad.
    const saveToggle = (input, call) =>
      input.addEventListener("change", async () => {
        input.disabled = true;
        try {
          await call(input.checked);
          toast(t("common.saved"));
        } catch (err) {
          input.checked = !input.checked;
          showError(err);
        } finally {
          input.disabled = false;
        }
      });
    routing.forEach((r) => saveToggle(root.querySelector(`#route-${CSS.escape(r.id)}`), (on) => api.updateRoutingRule(r.id, on)));
    if (canPrivacy) saveToggle(root.querySelector("#maskPii"), (on) => api.updatePrivacy({ maskPii: on }));
  },
});
