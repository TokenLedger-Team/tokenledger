import * as api from "../api.js";
import { startPage } from "../layout.js";
import { can } from "../auth.js";
import { t } from "../i18n.js";
import { head, row, hrow, busy } from "../ui.js";
import { escapeHtml, toast, showError } from "../format.js";

const FAMILY_HUE = { GPT: 162, Claude: 24, Gemini: 215, Llama: 268 };

startPage({
  id: "prices",
  load: () => api.getModels(),
  render(root, models, ctx) {
    const cols = "1.8fr 1fr 1fr";
    const editable = can.editPrices(ctx.user);
    const variant = (m) => models.filter((x) => x.family === m.family).indexOf(m);
    const bubble = (m) => {
      const h = (FAMILY_HUE[m.family] ?? 200) + variant(m) * 7;
      return `<span class="pbub" style="background:radial-gradient(circle at 30% 25%,hsl(${h} 72% 62%),hsl(${h} 72% 48%));box-shadow:0 0 16px hsl(${h} 80% 55% / .38)" aria-hidden="true"></span>`;
    };
    const input = (m, field) =>
      `<input type="number" step="0.001" min="0" value="${m[field]}" data-id="${escapeHtml(m.id)}" data-field="${field}" aria-label="${escapeHtml(m.name)}"${editable ? "" : " disabled"}>`;

    root.innerHTML = `<div class="views"><div class="vgrid"><article class="card">
      ${head(t("pr.title"), t(editable ? "pr.editSub" : "pr.readSub"))}
      ${hrow(cols, [t("pr.colModel"), t("pr.colInput"), t("pr.colOutput")])}
      ${models.map((m) => row(cols, [`<span class="pm">${bubble(m)}<span><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.provider)}</small></span></span>`, input(m, "inputPricePer1M"), input(m, "outputPricePer1M")])).join("")}
      <div class="actions"><button class="vbtn" type="button" id="savePrices"${editable ? "" : " disabled"}>${t("pr.save")}</button></div>
      <p class="vnote">${t("pr.note")}</p>
    </article></div></div>`;

    root.querySelector("#savePrices").addEventListener("click", (e) =>
      busy(e.currentTarget, async () => {
        // Šaljemo samo modele kojima je cena promenjena.
        const changed = models
          .map((m) => {
            const read = (f) => Number(root.querySelector(`input[data-id="${CSS.escape(m.id)}"][data-field="${f}"]`).value);
            return { m, input: read("inputPricePer1M"), output: read("outputPricePer1M") };
          })
          .filter((x) => x.input !== x.m.inputPricePer1M || x.output !== x.m.outputPricePer1M);
        try {
          await Promise.all(changed.map((x) => api.updateModelPrice(x.m.id, { inputPricePer1M: x.input, outputPricePer1M: x.output })));
          toast(t("pr.saved"));
          ctx.reload();
        } catch (err) {
          showError(err);
        }
      })
    );
  },
});
