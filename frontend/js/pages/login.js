import * as api from "../api.js";
import { config } from "../config.js";
import { setSession, getToken } from "../auth.js";
import { t, translatePage } from "../i18n.js";
import * as settings from "../settings.js";
import { startTesseract } from "../login-visual.js";

const $ = (id) => document.getElementById(id);
const form = $("loginForm");
const msg = $("msg");
let mode = "login"; // "login" | "signup"
let paused = false;

const say = (text, ok = false) => {
  msg.textContent = text;
  msg.classList.toggle("ok", ok);
};

function paint() {
  translatePage();
  document.title = `${t(mode === "signup" ? "signup.title" : "login.title")} · Token Ledger`;
  $("formTitle").textContent = t(mode === "signup" ? "signup.title" : "login.title");
  $("formSub").textContent = t(mode === "signup" ? "signup.sub" : "login.sub");
  $("submitBtn").textContent = t(mode === "signup" ? "signup.submit" : "login.submit");
  $("pwToggle").textContent = t($("password").type === "password" ? "login.show" : "login.hide");
  $("motionToggle").textContent = t(paused ? "login.play" : "login.pause");
  const dark = settings.getTheme() === "dark";
  $("themeToggle").innerHTML = `<span aria-hidden="true">${dark ? "☀" : "☾"}</span> ${t(dark ? "top.theme.light" : "top.theme.dark")}`;
  $("lang").value = settings.getLang();
  $("demoHint").classList.toggle("hidden", !config.USE_MOCK || mode !== "login");
}

function setMode(next) {
  mode = next;
  document.querySelectorAll(".signup-only").forEach((el) => el.classList.toggle("hidden", mode !== "signup"));
  document.querySelectorAll(".login-only").forEach((el) => el.classList.toggle("hidden", mode !== "login"));
  $("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  say("");
  paint();
}

async function finishLogin(token, user, remember) {
  setSession(token, user, remember);
  window.location.href = "index.html"; // Pregled vide sve uloge
}

// Povratak sa Google prijave: backend preusmerava na login.html?token=...
async function handleOAuthReturn() {
  const token = new URLSearchParams(location.search).get("token");
  if (!token) return false;
  history.replaceState(null, "", location.pathname);
  setSession(token, { id: "", name: "", email: "", role: "observer" });
  try {
    const user = await api.getMe();
    await finishLogin(token, user, true);
  } catch (err) {
    say(err.message);
  }
  return true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const okEmail = /^\S+@\S+\.\S+$/.test(email);
  $("email").setAttribute("aria-invalid", String(!okEmail));
  $("password").setAttribute("aria-invalid", String(!password));
  if (!okEmail) return say(t("login.badEmail")), $("email").focus();
  if (!password) return say(t("login.noPassword")), $("password").focus();

  if (mode === "signup") {
    const name = $("name").value.trim();
    const company = $("company").value.trim();
    if (!name || !company) return say(t("signup.missing"));
    if (password.length < 8) return say(t("signup.shortPassword"));
  }

  say(t("login.signingIn"), true);
  $("submitBtn").disabled = true;
  try {
    const remember = $("remember").checked;
    const res = mode === "signup"
      ? await api.signup({ name: $("name").value.trim(), company: $("company").value.trim(), email, password })
      : await api.login(email, password, remember);
    await finishLogin(res.token, res.user, mode === "signup" || remember);
  } catch (err) {
    say(err.message);
    $("submitBtn").disabled = false;
  }
});

$("pwToggle").addEventListener("click", (e) => {
  const show = $("password").type === "password";
  $("password").type = show ? "text" : "password";
  e.currentTarget.setAttribute("aria-pressed", String(show));
  paint();
});

$("forgot").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return say(t("login.enterEmailFirst")), $("email").focus();
  try {
    await api.forgotPassword(email);
    say(t("login.resetSent", { email }), true);
  } catch (err) {
    say(err.message);
  }
});

$("googleBtn").addEventListener("click", () => {
  if (config.USE_MOCK) return say(t("login.googleMock"));
  window.location.href = api.googleLoginUrl();
});

$("toSignup").addEventListener("click", () => setMode("signup"));
$("toLogin").addEventListener("click", () => setMode("login"));
$("lang").addEventListener("change", (e) => settings.set("lang", e.target.value));
$("themeToggle").addEventListener("click", () => settings.set("theme", settings.getTheme() === "dark" ? "light" : "dark"));
$("demoHint").addEventListener("click", (e) => {
  const email = e.target.closest("[data-demo]")?.dataset.demo;
  if (!email) return;
  $("email").value = email;
  $("password").value = "demo";
  form.requestSubmit();
});
settings.onChange(paint);

startTesseract((p) => {
  paused = p;
  paint();
});
setMode("login");

if (!(await handleOAuthReturn()) && getToken()) {
  // Već prijavljen korisnik ide pravo u aplikaciju.
  window.location.href = "index.html";
}
