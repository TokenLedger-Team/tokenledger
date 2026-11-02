import * as api from "../api.js";
import { startPage } from "../layout.js";
import { can } from "../auth.js";
import { t } from "../i18n.js";
import { busy, readOnlyNote } from "../ui.js";
import { fmtDateTime, convert, currencyCode, todayISO, downloadCsv, toast, showError } from "../format.js";

// CSV kolona → polje koje očekuje POST /usage/import
const COLUMNS = {
  date: "date",
  team: "team",
  function: "function",
  client: "client",
  model: "model",
  input_tokens: "inputTokens",
  output_tokens: "outputTokens",
  cost: "cost",
  requests: "requests",
};
const REQUIRED = ["date", "team", "function", "model", "input_tokens", "output_tokens"];

startPage({
  id: "reports",
  async load() {
    const [status, budgets] = await Promise.all([api.getReportStatus(), api.getBudgets()]);
    return { status, budgets };
  },
  render(root, { status, budgets }, ctx) {
    const canImport = can.importUsage(ctx.user);
    const stat = (icon, bg, label, value) =>
      `<div class="quick-stat"><span class="stat-icon ${bg}" aria-hidden="true">${icon}</span><div><small>${label}</small><strong>${value}</strong></div></div>`;

    root.innerHTML = `<div class="views"><div class="rp">
      <div class="quick-stats">
        ${stat("¤", "orange-bg", t("rep.currency"), currencyCode())}
        ${stat("↓", "green-bg", t("rep.lastImport"), fmtDateTime(status.lastImportAt))}
        ${stat("↑", "yellow-bg", t("rep.lastExport"), fmtDateTime(status.lastExportAt))}
      </div>
      <div class="rp-grid">
        <article class="card rp-card"><span class="stat-icon green-bg rp-ic" aria-hidden="true">↓</span>
          <div class="card-kicker">${t("rep.import")}</div><h2>${t("rep.importTitle")}</h2><p class="rp-p">${t("rep.importText")}</p>
          <label class="drop"><b>${t("rep.chooseCsv")}</b><input type="file" id="csvFile" accept=".csv,text/csv"${canImport ? "" : " disabled"}></label>
          <button class="vbtn" type="button" id="importBtn"${canImport ? "" : " disabled"}>${t("rep.importBtn")}</button>
          <p class="vnote">${t("rep.importCols")}</p>${readOnlyNote(canImport)}
        </article>
        <article class="card rp-card"><span class="stat-icon orange-bg rp-ic" aria-hidden="true">↑</span>
          <div class="card-kicker">${t("rep.export")}</div><h2>${t("rep.exportTitle")}</h2><p class="rp-p">${t("rep.exportText", { cur: currencyCode() })}</p>
          <div class="rp-btns"><button class="vbtn" type="button" id="csvBtn">${t("rep.csv")}</button><button class="vbtn ghost" type="button" id="pdfBtn">${t("rep.pdf")}</button></div>
          <p class="vnote">${t("rep.exportNote")}</p>
        </article>
      </div>
    </div></div>`;

    root.querySelector("#importBtn").addEventListener("click", (e) =>
      busy(e.currentTarget, async () => {
        const file = root.querySelector("#csvFile").files[0];
        if (!file) return toast(t("rep.chooseFirst"), "error");
        try {
          const rows = parseUsageCsv(await file.text());
          const result = await api.importUsage(rows);
          toast(t("rep.imported", { n: result.imported, skipped: result.skipped }));
          ctx.reload();
        } catch (err) {
          showError(err);
        }
      })
    );

    root.querySelector("#csvBtn").addEventListener("click", async () => {
      const cur = currencyCode();
      downloadCsv(`token-ledger-${todayISO()}.csv`, [
        [t("rep.csvTeam"), `${t("rep.csvSpent")}_${cur}`, `${t("rep.csvLimit")}_${cur}`],
        ...budgets.map((b) => [b.teamName, convert(b.spent).toFixed(2), b.limit ? convert(b.limit).toFixed(2) : ""]),
      ]);
      await logExport("csv", ctx);
    });
    root.querySelector("#pdfBtn").addEventListener("click", async () => {
      window.print();
      await logExport("pdf", ctx);
    });
  },
});

async function logExport(format, ctx) {
  try {
    await api.logExport(format);
    ctx.reload();
  } catch (err) {
    showError(err);
  }
}

/** Pretvara CSV u redove za POST /usage/import. Podržava navodnike i zarez ili tačka-zarez kao separator. */
function parseUsageCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error(t("rep.badCsv", { cols: REQUIRED.join(", ") }));
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (line) => {
    const out = [];
    let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(t("rep.badCsv", { cols: missing.join(", ") }));
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row = {};
    header.forEach((h, i) => {
      if (COLUMNS[h]) row[COLUMNS[h]] = cells[i] ?? "";
    });
    return row;
  });
}
