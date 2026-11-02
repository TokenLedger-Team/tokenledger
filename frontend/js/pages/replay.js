import * as api from "../api.js";
import { startPage } from "../layout.js";
import { can } from "../auth.js";
import { t } from "../i18n.js";
import { head, chip, row, hrow, options, readOnlyNote, busy } from "../ui.js";
import { fmtMoney, humanize, escapeHtml, toast, showError } from "../format.js";

const VERDICT_CLASS = { switch: "ok", check: "warn", dont: "bad" };
let selectedId = null;
let pollTimer = null;

startPage({
  id: "replay",
  async load() {
    const [replays, teams, models] = await Promise.all([api.getReplays(), api.getTeams(), api.getModels()]);
    return { replays, teams, models };
  },
  render(root, { replays, teams, models }, ctx) {
    const cols = "1.4fr 1.8fr .9fr 1.3fr";
    const name = (id) => models.find((m) => m.id === id)?.name ?? id;
    const canRun = can.runReplay(ctx.user);
    if (!replays.some((r) => r.id === selectedId)) selectedId = replays.find((r) => r.status === "done")?.id ?? replays[0]?.id ?? null;
    const sel = replays.find((r) => r.id === selectedId);
    const total = replays.reduce((s, r) => s + (r.savingsPerMonth || 0), 0);

    const verdictChip = (r) => (r.status === "done" ? chip(VERDICT_CLASS[r.verdict], t(`verdict.${r.verdict}`)) : chip("mute", t("verdict.running")));
    const functionOptions = teams.flatMap((tm) => tm.functions.map((fn) => ({ value: `${tm.id}|${fn}`, label: `${tm.name} · ${humanize(fn)}` })));

    root.innerHTML = `<div class="views"><div class="vgrid">
      <article class="card">${head(t("rp.tests"), t("rp.testsSub"))}
        ${replays.length ? `${hrow(cols, [t("rp.colWhat"), t("rp.colSwitchTo"), t("rp.colSave"), t("rp.colVerdict")], "stack-sm")}
        ${replays.map((r) => row(cols, [
          `<b>${escapeHtml(humanize(r.function))}</b><br><small class="muted" style="color:var(--muted)">${escapeHtml(r.teamName)}</small>`,
          escapeHtml(name(r.candidateModel)),
          r.status === "done" ? fmtMoney(r.savingsPerMonth, { whole: true }) : "—",
          verdictChip(r),
        ], { i: r.id, sel: r.id === selectedId, cls: "stack-sm" })).join("")}
        <p class="vnote">${t("rp.together", { amount: fmtMoney(total, { whole: true }) })}</p>` : `<p class="vnote">${t("rp.noTests")}</p>`}
      </article>

      <article class="card h6">${sel ? reportCard(sel, name) : head(t("rp.report"))}</article>

      <article class="card h6">${head(t("rp.new"), t("rp.newSub"))}
        <form class="vform" id="replayForm">
          <label>${t("rp.function")}<select name="fn" required>${options(functionOptions)}</select></label>
          <label>${t("rp.sampleSize")}<input type="number" name="sampleSize" value="200" min="20" max="1000" required></label>
          <label>${t("rp.candidate")}<select name="candidate">${options(models.map((m) => ({ value: m.id, label: m.name })), models.find((m) => m.lowCost)?.id)}</select></label>
          <label>${t("rp.scoring")}<select name="scoring">${options([{ value: "judge_rules", label: t("rp.judgeRules") }, { value: "rules", label: t("rp.rulesOnly") }])}</select></label>
        </form>
        <div class="actions"><button class="vbtn" type="submit" form="replayForm"${canRun && functionOptions.length ? "" : " disabled"}>${t("rp.run")}</button></div>
        ${readOnlyNote(canRun)}
      </article>
    </div></div>`;

    const selectRow = (el) => {
      selectedId = el.dataset.i;
      ctx.rerender();
    };
    root.querySelectorAll(".vrow[data-i]").forEach((el) => {
      el.addEventListener("click", () => selectRow(el));
      el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), selectRow(el)));
    });

    root.querySelector("#replayForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const [teamId, fn] = String(f.get("fn")).split("|");
      busy(e.submitter, async () => {
        try {
          const created = await api.createReplay({ teamId, function: fn, sampleSize: Number(f.get("sampleSize")), candidateModel: f.get("candidate"), scoring: f.get("scoring") });
          selectedId = created.id;
          toast(t("rp.queued"));
          ctx.reload();
        } catch (err) {
          showError(err);
        }
      });
    });

    // Dok ima testova u toku, osvežava listu na svake 3 sekunde.
    clearTimeout(pollTimer);
    if (replays.some((r) => r.status === "running")) pollTimer = setTimeout(() => ctx.reload(), 3000);
  },
});

function reportCard(r, name) {
  if (r.status !== "done") {
    return `${head(t("rp.report"), escapeHtml(`${humanize(r.function)} · ${r.teamName}`))}
      <div style="margin-top:12px">${chip("mute", t("verdict.running"))}</div><p class="vnote">${t("rp.running")}</p>`;
  }
  const speed = r.baseLatencyMs / r.candidateLatencyMs;
  return `${head(t("rp.report"), escapeHtml(`${humanize(r.function)} · ${r.teamName}`))}
    <div style="margin-top:12px">${chip(VERDICT_CLASS[r.verdict], t(`verdict.${r.verdict}`))}</div>
    <div class="vtiles">
      <div class="vtile"><small>${t("rp.quality")}</small><strong>${r.judgeScore}%</strong></div>
      <div class="vtile"><small>${t("rp.speed")}</small><strong>${speed >= 1 ? t("rp.faster", { x: speed.toFixed(1) }) : t("rp.slower", { x: (1 / speed).toFixed(1) })}</strong></div>
      <div class="vtile"><small>${t("rp.colSave")}</small><strong>${fmtMoney(r.savingsPerMonth, { whole: true })}</strong></div>
    </div>
    <p class="vnote">${escapeHtml(t("rp.sampled", { base: name(r.baseModel), cand: name(r.candidateModel), n: r.sampleSize }))} ${t("rp.rulesScore", { n: r.rulesScore })}</p>`;
}
