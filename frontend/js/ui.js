// Mali HTML gradivni blokovi za module (isti kao u dizajnu: kartica, red tabele, čip, prekidač).

import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";

export const head = (kicker, sub) =>
  `<div class="card-heading"><div><div class="card-kicker">${kicker}</div>${sub ? `<div class="subheading">${sub}</div>` : ""}</div></div>`;

export const chip = (cls, text) => `<span class="vchip ${cls}">${text}</span>`;

/** Red tabele: cols je CSS grid-template-columns, cells su HTML stringovi. */
export const row = (cols, cells, { i = null, sel = false, cls = "" } = {}) =>
  `<div class="vrow${sel ? " sel" : ""}${cls ? ` ${cls}` : ""}" style="--cols:${cols}"${i === null ? "" : ` data-i="${i}" tabindex="0" role="button"`}>${cells.map((c) => `<span>${c}</span>`).join("")}</div>`;

export const hrow = (cols, cells, cls = "") =>
  `<div class="vrow h${cls ? ` ${cls}` : ""}" style="--cols:${cols}">${cells.map((c) => `<span>${c}</span>`).join("")}</div>`;

export const toggle = (id, label, checked, disabled) =>
  `<label class="vsw"><input type="checkbox" id="${id}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}> ${label}</label>`;

export const options = (items, selected) =>
  items.map((i) => `<option value="${escapeHtml(i.value)}"${String(i.value) === String(selected ?? "") ? " selected" : ""}>${escapeHtml(i.label)}</option>`).join("");

export const readOnlyNote = (allowed) => (allowed ? "" : `<p class="vnote">${t("common.readOnly")}</p>`);

/** Isključuje dugme dok traje akcija, pa ga vraća. */
export async function busy(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } finally {
    if (button) button.disabled = false;
  }
}
