// Formatiranje (novac, brojevi, datumi), datumske pomoćne funkcije i sitnice za UI.
// Backend uvek vraća iznose u USD; ovde se pretvaraju u valutu koju je korisnik izabrao.

import { getCurrency } from "./settings.js";
import { t, locale } from "./i18n.js";

// Kurs se puni iz GET /currencies (vidi layout.js). Dok ne stigne, prikazuje se USD.
let rates = { USD: 1 };
export function setRates(next) {
  rates = { USD: 1, ...next };
}
const activeCurrency = () => (rates[getCurrency()] ? getCurrency() : "USD");

/** Pretvara iznos iz USD u izabranu valutu (bez formatiranja). */
export const convert = (usd) => (usd || 0) * rates[activeCurrency()];
/** Obrnuto: iz izabrane valute nazad u USD (za forme koje šalju iznos backendu). */
export const toUsd = (amount) => (amount || 0) / rates[activeCurrency()];
export const currencyCode = () => activeCurrency();

/** fmtMoney(1234.5) → "$1,234.50"; { short: true } → "$1.2k"; { whole: true } → "$1,235" */
export function fmtMoney(usd, { short = false, whole = false } = {}) {
  const value = convert(usd);
  const cur = activeCurrency();
  const opts = { style: "currency", currency: cur };
  if (short && Math.abs(value) >= 1000) {
    opts.notation = "compact";
    opts.maximumFractionDigits = 1;
  } else if (whole || short || cur === "RSD") {
    opts.maximumFractionDigits = 0;
  } else {
    opts.minimumFractionDigits = 2;
    opts.maximumFractionDigits = 2;
  }
  return new Intl.NumberFormat(locale(), opts).format(value);
}

export const fmtInt = (n) => new Intl.NumberFormat(locale()).format(Math.round(n || 0));
export const fmtCompact = (n) =>
  new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: n >= 1e6 ? 2 : 1 }).format(n || 0);
export const fmtPct = (ratio, digits = 0) =>
  new Intl.NumberFormat(locale(), { style: "percent", maximumFractionDigits: digits }).format(ratio || 0);

/** "2026-11-02" → "02. nov" / "Nov 02" */
export function fmtDay(iso) {
  return new Intl.DateTimeFormat(locale(), { month: "short", day: "2-digit" }).format(parseISODate(iso));
}
export function fmtDateTime(isoString) {
  if (!isoString) return t("common.never");
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(isoString));
}
export function fmtHour(hour) {
  const d = new Date(2000, 0, 1, hour);
  return new Intl.DateTimeFormat(locale(), { hour: "numeric", minute: "2-digit" }).format(d);
}
export function timeAgo(isoString) {
  const s = Math.max(0, Math.round((Date.now() - new Date(isoString)) / 1000));
  if (s < 60) return t("common.secondsAgo", { n: s });
  if (s < 3600) return t("common.minutesAgo", { n: Math.round(s / 60) });
  return t("common.hoursAgo", { n: Math.round(s / 3600) });
}

// ---------- Datumi ("YYYY-MM-DD", lokalno vreme) ----------
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}
export const todayISO = () => toISODate(new Date());
export function daysBetween(fromIso, toIso) {
  return Math.round((parseISODate(toIso) - parseISODate(fromIso)) / 86400000) + 1;
}
/** Poslednjih `days` dana do danas, plus isto toliko dana pre toga (za poređenje). */
export function periodRange(days) {
  const to = todayISO();
  const from = addDays(to, -(days - 1));
  return { from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}

// ---------- Tekst ----------
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** "ticket-classification" → "Ticket classification" (oznake funkcija stižu kao slug). */
export function humanize(slug) {
  if (!slug) return "";
  const s = String(slug).replace(/[-_]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ---------- UI sitnice ----------
let toastTimer;
export function toast(message, type = "info") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("error", type === "error");
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}
export function showError(err) {
  console.error(err);
  toast(err?.message || String(err), "error");
}

export function downloadCsv(filename, rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM da Excel ispravno prikaže č, ć, š, ž, đ
  const blob = new Blob(["﻿" + rows.map((r) => r.map(escape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}
