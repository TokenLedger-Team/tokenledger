import * as api from "../api.js";
import { startPage } from "../layout.js";
import { can } from "../auth.js";
import { t } from "../i18n.js";
import { head, chip, row, hrow, toggle, options, readOnlyNote, busy } from "../ui.js";
import { fmtMoney, fmtPct, escapeHtml, convert, toUsd, currencyCode, toast, showError } from "../format.js";

const STATUS = {
  ok: ["ok", "bud.onTrack"],
  willExceed: ["warn", "bud.willExceed"],
  almost: ["warn", "bud.almost"],
  over: ["bad", "bud.over"],
  none: ["mute", "dash.noBudget"],
};

startPage({
  id: "budgets",
  async load() {
    const [budgets, rules] = await Promise.all([api.getBudgets(), api.getAlertRules()]);
    return { budgets, rules };
  },
  render(root, { budgets, rules }, ctx) {
    const cols = "1.1fr 2fr 1.4fr 1.2fr 1fr";
    const canRules = can.editAlertRules(ctx.user);
    const canLimits = can.editLimits(ctx.user);

    root.innerHTML = `<div class="views"><div class="vgrid">
      <article class="card">${head(t("bud.teamBudgets"), t("bud.teamBudgetsSub", { pct: rules.warnAtPct }))}
        ${hrow(cols, [t("bud.colTeam"), t("bud.colUsed"), t("bud.colSpent"), t("bud.colForecast"), t("bud.colStatus")], "stack-sm")}
        ${budgets.map((b) => {
          const ratio = b.limit ? b.spent / b.limit : 0;
          const [cls, label] = STATUS[b.status] ?? STATUS.none;
          const color = cls === "mute" ? "var(--muted)" : `var(--${cls})`;
          return row(cols, [
            `<b>${escapeHtml(b.teamName)}</b>`,
            `<span class="mm-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}" aria-label="${escapeHtml(b.teamName)}">
              <i style="width:${Math.min(ratio, 1) * 100}%;background:${color}"></i><u class="vmark" style="left:${rules.warnAtPct}%"></u></span>`,
            b.limit ? `${fmtMoney(b.spent, { whole: true })} / ${fmtMoney(b.limit, { whole: true })} · ${fmtPct(ratio)}` : fmtMoney(b.spent, { whole: true }),
            fmtMoney(b.forecast, { whole: true }),
            chip(cls, t(label)),
          ], { cls: "stack-sm" });
        }).join("")}
      </article>

      <article class="card h6">${head(t("bud.alertRules"), t("bud.alertRulesSub"))}
        <div class="vform" style="grid-template-columns:minmax(0,200px)"><label>${t("bud.warnAt")}
          <input type="number" id="warnAtPct" min="1" max="100" value="${rules.warnAtPct}"${canRules ? "" : " disabled"}></label></div>
        ${toggle("emailLeadAtWarn", t("bud.ruleWarn", { pct: rules.warnAtPct }), rules.emailLeadAtWarn, !canRules)}
        ${toggle("emailAdminsAtLimit", t("bud.ruleOver"), rules.emailAdminsAtLimit, !canRules)}
        ${toggle("slackAtLimit", t("bud.ruleSlack"), rules.slackAtLimit, !canRules)}
        <div class="actions"><button class="vbtn" id="saveRules" type="button"${canRules ? "" : " disabled"}>${t("bud.saveRules")}</button></div>
        ${readOnlyNote(canRules)}
      </article>

      <article class="card h6">${head(t("bud.setLimit"), t("bud.setLimitSub"))}
        <form class="vform" id="limitForm">
          <label>${t("bud.team")}<select id="limitTeam">${options(budgets.map((b) => ({ value: b.teamId, label: b.teamName })))}</select></label>
          <label>${t("bud.monthlyLimit", { cur: currencyCode() })}<input type="number" id="limitValue" min="1" step="1"${canLimits ? "" : " disabled"}></label>
          <button class="vbtn" type="submit"${canLimits ? "" : " disabled"}>${t("bud.updateLimit")}</button>
        </form>
        ${readOnlyNote(canLimits)}
      </article>
    </div></div>`;

    // Polje za limit prikazuje trenutni limit izabranog tima, u valuti prikaza.
    const teamSel = root.querySelector("#limitTeam");
    const limitInput = root.querySelector("#limitValue");
    const fillLimit = () => {
      const b = budgets.find((x) => x.teamId === teamSel.value);
      limitInput.value = b?.limit ? Math.round(convert(b.limit)) : "";
    };
    teamSel.addEventListener("change", fillLimit);
    fillLimit();

    root.querySelector("#limitForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const value = Number(limitInput.value);
      if (!(value > 0)) return toast(t("bud.invalidLimit"), "error");
      busy(e.submitter, async () => {
        try {
          // Backend čuva limit u USD.
          await api.updateBudget(teamSel.value, Math.round(toUsd(value) * 100) / 100);
          toast(t("bud.limitSaved", { team: teamSel.selectedOptions[0].text }));
          ctx.reload();
        } catch (err) {
          showError(err);
        }
      });
    });

    root.querySelector("#saveRules").addEventListener("click", (e) =>
      busy(e.currentTarget, async () => {
        try {
          await api.updateAlertRules({
            warnAtPct: Number(root.querySelector("#warnAtPct").value),
            emailLeadAtWarn: root.querySelector("#emailLeadAtWarn").checked,
            emailAdminsAtLimit: root.querySelector("#emailAdminsAtLimit").checked,
            slackAtLimit: root.querySelector("#slackAtLimit").checked,
          });
          toast(t("bud.rulesSaved"));
          ctx.reload();
        } catch (err) {
          showError(err);
        }
      })
    );
  },
});
