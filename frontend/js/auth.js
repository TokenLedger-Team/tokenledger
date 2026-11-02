// Sesija (token + korisnik) i prava po ulogama.
// Napomena: provere ovde su samo za prikaz. Backend MORA sam da proverava prava.

const TOKEN_KEY = "tl_token";
const USER_KEY = "tl_user";

// "Zapamti me" → localStorage (ostaje posle zatvaranja browsera), inače sessionStorage.
function stores() {
  const list = [];
  try { list.push(localStorage); } catch { /* blokirano */ }
  try { list.push(sessionStorage); } catch { /* blokirano */ }
  return list;
}

function readKey(key) {
  for (const s of stores()) {
    try {
      const v = s.getItem(key);
      if (v) return v;
    } catch { /* ignorisano */ }
  }
  return null;
}

export const getToken = () => readKey(TOKEN_KEY);

export function getUser() {
  try {
    return JSON.parse(readKey(USER_KEY));
  } catch {
    return null;
  }
}

export function setSession(token, user, remember = true) {
  clearSession();
  try {
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
  } catch { /* bez storage-a sesija ne preživljava osvežavanje */ }
}

export function clearSession() {
  for (const s of stores()) {
    try {
      s.removeItem(TOKEN_KEY);
      s.removeItem(USER_KEY);
    } catch { /* ignorisano */ }
  }
}

export function goToLogin() {
  clearSession();
  window.location.href = "login.html";
}

// Koje module koja uloga vidi (isto kao u dizajnu).
export const PAGES_BY_ROLE = {
  admin: ["dashboard", "budgets", "replay", "insights", "reports", "setup", "prices"],
  lead: ["dashboard", "budgets", "replay", "insights", "reports"],
  observer: ["dashboard", "budgets", "replay"],
};

export const canView = (user, page) => (PAGES_BY_ROLE[user?.role] || []).includes(page);

/** Šta uloga sme da menja u interfejsu (backend vraća 403 ako ipak pokuša). */
export const can = {
  editLimits: (u) => u.role === "admin",
  editAlertRules: (u) => u.role === "admin" || u.role === "lead",
  runReplay: (u) => u.role === "admin" || u.role === "lead",
  editRouting: (u) => u.role === "admin" || u.role === "lead",
  editPrivacy: (u) => u.role === "admin",
  importUsage: (u) => u.role === "admin" || u.role === "lead",
  manageOrg: (u) => u.role === "admin",
  editPrices: (u) => u.role === "admin",
};
