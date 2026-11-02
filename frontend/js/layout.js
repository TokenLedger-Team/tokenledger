// Zajednički okvir svake stranice: bočni meni, gornja traka, footer,
// učitavanje podataka i ponovno iscrtavanje kad se promeni jezik/valuta/period/tema.

import * as api from "./api.js";
import { config } from "./config.js";
import { getUser, getToken, goToLogin, canView, PAGES_BY_ROLE } from "./auth.js";
import { t, translatePage } from "./i18n.js";
import * as settings from "./settings.js";
import { setRates, periodRange, escapeHtml, initials, timeAgo, showError } from "./format.js";

export const PAGES = {
  dashboard: { href: "index.html", icon: "⌂" },
  budgets: { href: "budgets.html", icon: "▥" },
  replay: { href: "replay.html", icon: "✧" },
  insights: { href: "insights.html", icon: "⬡" },
  reports: { href: "reports.html", icon: "▤" },
  setup: { href: "setup.html", icon: "⚙" },
  prices: { href: "prices.html", icon: "$" },
};

const BRAND_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 36 11v18L20 38 4 29V11z" fill="currentColor" opacity=".17"/><path d="M20 2 36 11 20 20 4 11zM4 11v18l16 9V20zM36 11v18l-16 9V20z" fill="currentColor"/><path d="m20 2 0 18 16-9z" fill="#fff" opacity=".24"/></svg>`;
const PROVIDER_LOGO = { openai: "✳", anthropic: "✺", google: "G", azure: "A" };

/**
 * Pokreće stranicu.
 * @param {object} page
 * @param {string} page.id             ključ iz PAGES
 * @param {boolean} [page.usesPeriod]  da li stranica koristi izbor perioda u gornjoj traci
 * @param {(ctx) => Promise<any>} page.load    učitava podatke preko api.js
 * @param {(el, data, ctx) => void} page.render  iscrtava sadržaj u #page
 */
export function startPage(page) {
  const user = getUser();
  if (!getToken() || !user) return goToLogin();
  if (!canView(user, page.id)) {
    window.location.href = PAGES[PAGES_BY_ROLE[user.role]?.[0] || "dashboard"].href;
    return;
  }

  document.documentElement.lang = settings.getLang();
  const root = document.getElementById("page");
  const shared = { providers: [], proxy: null };
  let data = null;

  const ctx = {
    user,
    get period() {
      return { days: settings.getPeriodDays(), ...periodRange(settings.getPeriodDays()) };
    },
    /** Ponovo učitava podatke stranice (npr. posle čuvanja). */
    reload: () => loadPage(),
    /** Ponovo iscrtava bez novog učitavanja. */
    rerender: () => data && page.render(root, data, ctx),
  };

  function renderShell() {
    renderSidebar(user, page.id, shared);
    renderTopbar(user, page);
    renderFooter();
    document.title = `${t(`nav.${page.id}`)} · Token Ledger`;
  }

  async function loadPage() {
    root.innerHTML = `<div class="card loading">${t("common.loading")}</div>`;
    try {
      data = await page.load(ctx);
      page.render(root, data, ctx);
    } catch (err) {
      console.error(err);
      root.innerHTML = `<div class="error-box">${escapeHtml(t("common.loadError", { msg: err.message }))}
        <button class="vbtn ghost small" type="button" id="retry" style="margin-left:12px">${t("common.retry")}</button></div>`;
      document.getElementById("retry").addEventListener("click", loadPage);
    }
  }

  async function loadShared() {
    const [currencies, providers, proxy] = await Promise.allSettled([api.getCurrencies(), api.getProviders(), api.getProxyStatus()]);
    if (currencies.status === "fulfilled") setRates(currencies.value.rates);
    shared.providers = providers.status === "fulfilled" ? providers.value : [];
    shared.proxy = proxy.status === "fulfilled" ? proxy.value : null;
    renderSidebar(user, page.id, shared);
  }

  settings.onChange((name) => {
    if (name === "lang") {
      renderShell();
      ctx.rerender();
    } else if (name === "period") {
      loadPage();
    } else {
      renderTopbar(user, page);
      ctx.rerender();
    }
  });

  // Klik van menija profila ga zatvara (jedan slušalac za celu stranicu).
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("profileMenu");
    if (menu && !menu.contains(e.target)) {
      menu.classList.add("hidden");
      document.getElementById("profileBtn")?.setAttribute("aria-expanded", "false");
    }
  });

  renderShell();
  // Kurs mora stići pre prvog iscrtavanja iznosa.
  loadShared().finally(loadPage);
  return ctx;
}

function renderSidebar(user, active, shared) {
  const el = document.getElementById("sidebar");
  const nav = PAGES_BY_ROLE[user.role]
    .map((id) => `<a class="nav-item${id === active ? " active" : ""}" href="${PAGES[id].href}"${id === active ? ' aria-current="page"' : ""}>
      <span class="nav-icon" aria-hidden="true">${PAGES[id].icon}</span>${t(`nav.${id}`)}</a>`)
    .join("");
  const providers = shared.providers
    .map((p) => `<div class="provider"><span class="provider-logo p-${escapeHtml(p.id)}" aria-hidden="true">${PROVIDER_LOGO[p.id] ?? escapeHtml(p.name[0])}</span>${escapeHtml(p.name)}${p.connected ? '<span class="connected" title="connected"></span>' : ""}</div>`)
    .join("");
  const proxy = shared.proxy;
  el.innerHTML = `
    <a class="brand" href="index.html" aria-label="Token Ledger"><span class="brand-mark">${BRAND_SVG}</span><span>Token Ledger</span></a>
    <div class="nav-label">${t("nav.modules")}</div>
    <nav class="nav" aria-label="${t("nav.modules")}">${nav}</nav>
    ${providers ? `<div class="sidebar-divider"></div><div class="nav-label">${t("nav.providers")}</div>${providers}` : ""}
    ${proxy ? `<div class="sidebar-bottom">
      <div class="health-dot${proxy.healthy ? "" : " down"}"></div>
      <div><strong>${t(proxy.healthy ? "proxy.healthy" : "proxy.down")}</strong><small>${t("proxy.lastCall", { ago: timeAgo(proxy.lastCallAt) })}</small></div>
      ${proxy.healthy ? '<span class="health-check" aria-hidden="true">✓</span>' : ""}</div>` : ""}`;
}

function renderTopbar(user, page) {
  const el = document.getElementById("topbar");
  const lang = settings.getLang();
  const cur = settings.getCurrency();
  const dark = settings.getTheme() === "dark";
  const period = String(settings.getPeriodDays());
  const opt = (value, label, selected) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;

  el.innerHTML = `
    <div>
      <div class="eyebrow">${t("nav.modules")} / ${t(`nav.${page.id}`)}</div>
      <h1>${t(`nav.${page.id}`)} <span class="title-period">— ${t(`sub.${page.id}`)}</span></h1>
    </div>
    <div class="top-actions">
      <select class="top-select" id="lang" aria-label="${t("top.language")}">${opt("sr", "SR", lang)}${opt("en", "EN", lang)}</select>
      <select class="top-select" id="currency" aria-label="${t("top.currency")}">${["USD", "EUR", "RSD"].map((c) => opt(c, c, cur)).join("")}</select>
      <button class="theme-toggle" id="themeToggle" type="button" aria-label="${t("top.themeToggle")}"><span aria-hidden="true">${dark ? "☀" : "☾"}</span>${t(dark ? "top.theme.light" : "top.theme.dark")}</button>
      ${page.usesPeriod ? `<label class="date-control"><span aria-hidden="true">▦</span><select id="period" aria-label="${t("top.period")}">
        ${opt("7", t("top.last7"), period)}${opt("30", t("top.last30"), period)}${opt("90", t("top.last90"), period)}</select></label>` : ""}
      <div class="profile-wrap">
        <button class="profile" id="profileBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="${t("top.account")}">
          <span class="avatar">${escapeHtml(initials(user.name))}</span>
          <span class="profile-copy"><strong>${escapeHtml(user.name)}</strong><small>${t(`role.${user.role}`)}</small></span><span aria-hidden="true">⌄</span>
        </button>
        <div class="profile-menu hidden" id="profileMenu">
          <strong>${escapeHtml(user.name)}</strong>
          <div class="pm-email">${escapeHtml(user.email)} · ${t(`role.${user.role}`)}</div>
          <button class="vbtn ghost small" type="button" id="logoutBtn">${t("top.logout")}</button>
        </div>
      </div>
    </div>`;

  el.querySelector("#lang").addEventListener("change", (e) => settings.set("lang", e.target.value));
  el.querySelector("#currency").addEventListener("change", (e) => settings.set("currency", e.target.value));
  el.querySelector("#themeToggle").addEventListener("click", () => settings.set("theme", dark ? "light" : "dark"));
  el.querySelector("#period")?.addEventListener("change", (e) => settings.set("period", e.target.value));

  const btn = el.querySelector("#profileBtn");
  const menu = el.querySelector("#profileMenu");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("hidden") === false;
    btn.setAttribute("aria-expanded", String(open));
  });
  el.querySelector("#logoutBtn").addEventListener("click", async () => {
    try {
      await api.logout();
    } catch (err) {
      showError(err);
    }
    goToLogin();
  });
}

function renderFooter() {
  const el = document.getElementById("footer");
  el.innerHTML = `<span>Token Ledger <span class="footer-dot">•</span> ${t("app.tagline")}</span>
    <span>${config.USE_MOCK ? `<span class="demo-badge">${t("common.demoData")}</span>` : t("common.liveData")} · ${t("common.updatedNow")}</span>`;
  translatePage(el);
}
