// Korisnička podešavanja koja se pamte u browseru: jezik, valuta, period, tema.
// Ovo su samo lične preference prikaza; ništa od ovoga ne ide na backend.

import { config } from "./config.js";

const KEYS = { lang: "tl-lang", currency: "tl-currency", period: "tl-period", theme: "tl-theme" };
const ALLOWED = {
  lang: ["sr", "en"],
  currency: ["USD", "EUR", "RSD"],
  period: ["7", "30", "90"],
  theme: ["light", "dark"],
};
const DEFAULTS = {
  lang: config.DEFAULT_LANG,
  currency: config.DEFAULT_CURRENCY,
  period: String(config.DEFAULT_PERIOD_DAYS),
  theme: null,
};

const memory = {};

function read(name) {
  if (memory[name]) return memory[name];
  try {
    const value = localStorage.getItem(KEYS[name]);
    return ALLOWED[name].includes(value) ? value : DEFAULTS[name];
  } catch {
    return DEFAULTS[name];
  }
}

const listeners = new Set();

export const getLang = () => read("lang");
export const getCurrency = () => read("currency");
export const getPeriodDays = () => Number(read("period"));
export const getTheme = () => document.documentElement.dataset.theme || "light";

export function set(name, value) {
  memory[name] = String(value);
  try {
    localStorage.setItem(KEYS[name], String(value));
  } catch {
    // bez localStorage-a podešavanje važi do osvežavanja stranice
  }
  if (name === "theme") document.documentElement.dataset.theme = value;
  if (name === "lang") document.documentElement.lang = value;
  listeners.forEach((fn) => fn(name, value));
}

/** fn(name, value) se poziva kad se promeni neko podešavanje. */
export function onChange(fn) {
  listeners.add(fn);
}
