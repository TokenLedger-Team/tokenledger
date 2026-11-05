// Svi pozivi ka backendu prolaze kroz ovaj fajl.
// Jedna funkcija = jedan endpoint iz frontend/API.md.
// Kada je config.USE_MOCK = true, isti zahtev obrađuje js/mock/server.js.

import { config } from "./config.js";
import { getToken, goToLogin } from "./auth.js";
import { getLang } from "./settings.js";

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, { query, body } = {}) {
  const cleanQuery = Object.fromEntries(
    Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")
  );

  let result;
  if (config.USE_MOCK) {
    // Mock se učitava tek kad zatreba, pa ga produkcija nikad ne povuče.
    const { mockRequest } = await import("./mock/server.js");
    result = await mockRequest(method, path, { query: cleanQuery, body, token: getToken(), lang: getLang() });
  } else {
    result = await httpRequest(method, path, cleanQuery, body);
  }

  if (result.status === 401 && !path.startsWith("/auth/")) goToLogin();
  if (result.status >= 400 || result.status === 0) {
    throw new ApiError(result.status, result.data?.message || `HTTP ${result.status}`);
  }
  return result.data;
}

async function httpRequest(method, path, query, body) {
  const qs = new URLSearchParams(query).toString();
  const url = `${config.API_BASE_URL}${path}${qs ? `?${qs}` : ""}`;
  const headers = { Accept: "application/json", "Accept-Language": getLang() };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    return { status: 0, data: { message: `Backend nije dostupan (${config.API_BASE_URL}).` } };
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { status: res.status, data };
}

const GET = (path, query) => request("GET", path, { query });
const POST = (path, body) => request("POST", path, { body });
const PUT = (path, body) => request("PUT", path, { body });
const DELETE = (path) => request("DELETE", path);

// ---------- Autentikacija ----------
export const login = (email, password, remember) => POST("/auth/login", { email, password, remember });
export const signup = (data) => POST("/auth/signup", data); // { name, company, email, password }
export const forgotPassword = (email) => POST("/auth/forgot-password", { email });
export const logout = () => POST("/auth/logout");
export const getMe = () => GET("/auth/me");
/** Google prijava: browser se preusmerava na backend, koji vraća korisnika na login.html?token=... */
export const googleLoginUrl = () => `${config.API_BASE_URL}/auth/google`;

// ---------- Organizacija, valute, provajderi, proxy ----------
export const getOrg = () => GET("/org");
export const getCurrencies = () => GET("/currencies");
export const getProviders = () => GET("/providers");
export const addProviderKey = (providerId, key) => POST(`/providers/${providerId}/keys`, key); // { apiKey, environment }
export const deleteProviderKey = (providerId, keyId) => DELETE(`/providers/${providerId}/keys/${keyId}`);
export const getProxyStatus = () => GET("/proxy/status");
export const getProxyKeys = () => GET("/proxy-keys");
/** Vraća { id, name, last4, createdAt, key }; pun `key` stiže samo ovde, jednom. */
export const createProxyKey = (name) => POST("/proxy-keys", { name });
export const deleteProxyKey = (id) => DELETE(`/proxy-keys/${id}`);

// ---------- Statistika (dashboard) ----------
export const getSummary = (from, to) => GET("/stats/summary", { from, to });
export const getTimeseries = (from, to) => GET("/stats/timeseries", { from, to });
/** by: "team" | "function" | "client" | "model" */
export const getBreakdown = (from, to, by) => GET("/stats/breakdown", { from, to, by });
export const getHourly = (date) => GET("/stats/hourly", { date });
export const getModelFleet = () => GET("/stats/models");
export const getOptimization = (from, to) => GET("/stats/optimization", { from, to });

// ---------- Budžeti ----------
export const getBudgets = () => GET("/budgets");
export const updateBudget = (teamId, limit) => PUT(`/budgets/${teamId}`, { limit });
export const getAlertRules = () => GET("/alert-rules");
export const updateAlertRules = (rules) => PUT("/alert-rules", rules);

// ---------- Replay testovi ----------
export const getReplays = () => GET("/replays");
export const createReplay = (test) => POST("/replays", test); // { teamId, function, sampleSize, candidateModel, scoring }

// ---------- Uvidi i automatizacija ----------
export const getAnomalies = () => GET("/insights/anomalies");
export const getCacheStats = () => GET("/insights/cache");
export const getForecast = () => GET("/insights/forecast");
export const getRoutingRules = () => GET("/routing-rules");
export const updateRoutingRule = (id, enabled) => PUT(`/routing-rules/${id}`, { enabled });
export const getPrivacy = () => GET("/settings/privacy");
export const updatePrivacy = (settings) => PUT("/settings/privacy", settings);

// ---------- Izveštaji i uvoz ----------
export const getReportStatus = () => GET("/reports/status");
export const importUsage = (rows) => POST("/usage/import", { rows });
export const logExport = (format) => POST("/reports/exports", { format });

// ---------- Timovi i korisnici ----------
export const getTeams = () => GET("/teams");
export const createTeam = (name) => POST("/teams", { name });
export const getUsers = () => GET("/users");
export const inviteUser = (user) => POST("/users", user); // { name, email, role, teamId }
export const updateUser = (id, changes) => PUT(`/users/${id}`, changes);
export const deleteUser = (id) => DELETE(`/users/${id}`);

// ---------- Modeli i cene ----------
export const getModels = () => GET("/models");
export const updateModelPrice = (id, prices) => PUT(`/models/${id}`, prices); // { inputPricePer1M, outputPricePer1M }
