import * as api from "../api.js";
import { startPage } from "../layout.js";
import { t } from "../i18n.js";
import { chip, row, hrow, options, busy, copyText } from "../ui.js";
import { escapeHtml, humanize, fmtDateTime, toast, showError } from "../format.js";

const ROLES = ["admin", "lead", "observer"];
// Lokalno stanje uputstva za povezivanje (ne zavisi od servera).
const cfg = { provider: "openai", teamId: null };

// Adrese i primeri prate backend/README.md (odeljak "Proxy: kako povezati agenta").
const PROVIDERS = {
  openai: { label: "OpenAI", path: "/openai/v1", model: "gpt-4o-mini" },
  anthropic: { label: "Anthropic", path: "/anthropic", model: "claude-haiku-4-5-20251001" },
};

startPage({
  id: "setup",
  async load() {
    const [org, providers, teams, users, proxyKeys] = await Promise.all([
      api.getOrg(), api.getProviders(), api.getTeams(), api.getUsers(), api.getProxyKeys(),
    ]);
    return { org, providers, teams, users, proxyKeys };
  },
  render(root, { org, providers, teams, users, proxyKeys }, ctx) {
    const step = (n, title, sub) =>
      `<div class="stp"><span class="stp-n">${n}</span><div><div class="stp-t">${title}</div>${sub ? `<div class="subheading">${sub}</div>` : ""}</div></div>`;
    const keys = providers.flatMap((p) => p.keys.map((k) => ({ ...k, provider: p })));
    const teamItems = [{ value: "", label: t("set.noTeam") }, ...teams.map((x) => ({ value: x.id, label: x.name }))];
    const roleItems = ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }));
    const userCols = "1.2fr 1.6fr 1fr 1fr auto";
    const pkCols = "1.4fr 1.2fr 1.4fr auto";

    root.innerHTML = `<div class="views"><div class="vgrid">
      <article class="card h6">${step(1, t("set.step1"), t("set.step1Sub"))}
        ${keys.length ? keys.map((k) => row("1fr 1fr 1.2fr auto auto", [
          `<b>${escapeHtml(k.provider.name)}</b>`, escapeHtml(k.environment), `<code>sk-••••••${escapeHtml(k.last4)}</code>`, chip("ok", t("set.encrypted")),
          `<button class="vbtn danger small" type="button" data-del-key="${escapeHtml(k.provider.id)}|${escapeHtml(k.id)}" aria-label="${t("common.delete")}">✕</button>`,
        ])).join("") : `<p class="vnote">${t("set.noKeys")}</p>`}
        <form class="vform" id="keyForm">
          <label>${t("set.colProvider")}<select name="provider">${options(providers.map((p) => ({ value: p.id, label: p.name })))}</select></label>
          <label>${t("set.colEnv")}<select name="environment">${options([{ value: "production", label: "production" }, { value: "staging", label: "staging" }])}</select></label>
          <label>${t("set.apiKey")}<input type="password" name="apiKey" autocomplete="off" required minlength="8"></label>
          <button class="vbtn" type="submit">${t("set.saveKey")}</button>
        </form>
      </article>

      <article class="card h6">${step(2, t("set.step2"))}
        ${hrow("1.1fr 1fr 1.6fr 1.2fr", [t("set.colTeam"), t("set.colSlug"), t("set.colFunctions"), t("set.colClients")])}
        ${teams.map((x) => row("1.1fr 1fr 1.6fr 1.2fr", [`<b>${escapeHtml(x.name)}</b>`, `<code>${escapeHtml(x.slug)}</code>`, String(x.functions.length), x.clients.map((c) => escapeHtml(humanize(c))).join(", ") || "—"])).join("")}
        <form class="vform" id="teamForm"><label>${t("set.teamName")}<input type="text" name="name" required></label><button class="vbtn" type="submit">${t("set.addTeam")}</button></form>
      </article>

      <article class="card" id="povezivanje">${step(3, t("set.step3"), t("set.step3Sub"))}
        <h3 class="card-kicker" style="margin:8px 0 4px">${t("pk.title")}</h3>
        ${proxyKeys.length ? `${hrow(pkCols, [t("pk.colName"), t("pk.colKey"), t("pk.colCreated"), ""], "stack-sm")}
        ${proxyKeys.map((k) => row(pkCols, [
          `<b>${escapeHtml(k.name)}</b>`,
          `<code>tl_••••••${escapeHtml(k.last4)}</code>`,
          escapeHtml(fmtDateTime(k.createdAt)),
          `<button class="vbtn danger small" type="button" data-del-pk="${escapeHtml(k.id)}" data-name="${escapeHtml(k.name)}" aria-label="${t("common.delete")}">✕</button>`,
        ], { cls: "stack-sm" })).join("")}` : `<p class="vnote">${t("pk.none")}</p>`}
        <form class="vform" id="proxyKeyForm">
          <label>${t("pk.name")}<input type="text" name="name" maxlength="80" required placeholder="${escapeHtml(t("pk.namePlaceholder"))}"></label>
          <button class="vbtn" type="submit">${t("pk.create")}</button>
        </form>

        <h3 class="card-kicker" style="margin:28px 0 4px">${t("cfg.title")}</h3>
        <div id="proxyConfig"></div>
      </article>

      <article class="card">${step(4, t("set.step4"))}
        ${hrow(userCols, [t("set.colName"), t("set.colEmail"), t("set.colRole"), t("set.colTeam"), ""], "stack-sm")}
        ${users.map((u) => {
          const self = u.id === ctx.user.id;
          return row(userCols, [
            `<b>${escapeHtml(u.name)}</b>${self ? ` <span class="vchip mute">${t("set.you")}</span>` : ""}`,
            escapeHtml(u.email),
            `<select data-user="${escapeHtml(u.id)}" data-field="role" aria-label="${t("set.colRole")}"${self ? " disabled" : ""}>${options(roleItems, u.role)}</select>`,
            `<select data-user="${escapeHtml(u.id)}" data-field="teamId" aria-label="${t("set.colTeam")}">${options(teamItems, u.teamId ?? "")}</select>`,
            self ? '<span style="display:inline-block;width:34px"></span>' : `<button class="vbtn danger small" type="button" data-del-user="${escapeHtml(u.id)}" aria-label="${t("common.delete")}">✕</button>`,
          ], { cls: "stack-sm" });
        }).join("")}
        <form class="vform" id="inviteForm">
          <label>${t("set.colName")}<input type="text" name="name" required></label>
          <label>${t("set.colEmail")}<input type="email" name="email" required></label>
          <label>${t("set.password")}<input type="password" name="password" minlength="8" autocomplete="new-password" required></label>
          <label>${t("set.colRole")}<select name="role">${options(roleItems, "observer")}</select></label>
          <label>${t("set.colTeam")}<select name="teamId">${options(teamItems)}</select></label>
          <button class="vbtn" type="submit">${t("set.invite")}</button>
        </form>
      </article>
    </div></div>`;

    renderProxyConfig(root.querySelector("#proxyConfig"), org, teams);

    const submit = (id, fn) =>
      root.querySelector(id).addEventListener("submit", (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        busy(e.submitter, async () => {
          try {
            await fn(data);
            ctx.reload();
          } catch (err) {
            showError(err);
          }
        });
      });

    submit("#keyForm", async (d) => {
      await api.addProviderKey(d.provider, { apiKey: d.apiKey, environment: d.environment });
      toast(t("set.keySaved"));
    });
    submit("#teamForm", async (d) => {
      await api.createTeam(d.name.trim());
      toast(t("common.saved"));
    });
    submit("#inviteForm", async (d) => {
      await api.inviteUser({ name: d.name.trim(), email: d.email.trim(), password: d.password, role: d.role, teamId: d.teamId || null });
      toast(t("set.invited", { email: d.email.trim() }));
    });

    root.querySelector("#proxyKeyForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = e.target.elements.name.value.trim();
      if (!name || name.length > 80) return toast(t("pk.nameRequired"), "error");
      busy(e.submitter, async () => {
        try {
          const created = await api.createProxyKey(name);
          e.target.reset();
          // Pun ključ ide samo u prozor; lista se osvežava sa servera (samo last4).
          showNewKey(created.name, created.key);
          ctx.reload();
        } catch (err) {
          showError(err);
        }
      });
    });

    root.querySelectorAll("select[data-user]").forEach((sel) =>
      sel.addEventListener("change", async () => {
        try {
          await api.updateUser(sel.dataset.user, { [sel.dataset.field]: sel.value || null });
          toast(t("common.saved"));
        } catch (err) {
          showError(err);
          ctx.reload();
        }
      })
    );

    // onclick (ne addEventListener) jer se #page ponovo koristi pri svakom iscrtavanju.
    root.onclick = async (e) => {
      const keyBtn = e.target.closest("[data-del-key]");
      const userBtn = e.target.closest("[data-del-user]");
      const pkBtn = e.target.closest("[data-del-pk]");
      if (!keyBtn && !userBtn && !pkBtn) return;
      const question = pkBtn ? t("pk.confirmDelete", { name: pkBtn.dataset.name }) : t("common.confirmDelete");
      if (!confirm(question)) return;
      try {
        if (keyBtn) {
          const [providerId, keyId] = keyBtn.dataset.delKey.split("|");
          await api.deleteProviderKey(providerId, keyId);
          toast(t("common.deleted"));
        } else if (pkBtn) {
          await api.deleteProxyKey(pkBtn.dataset.delPk);
          toast(t("pk.deleted"));
        } else {
          await api.deleteUser(userBtn.dataset.delUser);
          toast(t("common.deleted"));
        }
        ctx.reload();
      } catch (err) {
        showError(err);
      }
    };

    // Link sa praznog Pregleda vodi na setup.html#povezivanje; sadržaj se crta posle učitavanja.
    if (location.hash === "#povezivanje") {
      root.querySelector("#povezivanje").scrollIntoView({ block: "start" });
      history.replaceState(null, "", location.pathname);
    }
  },
});

// ---------- Uputstvo za povezivanje (provajder, adresa, autentikacija, SDK primeri) ----------

function renderProxyConfig(el, org, teams) {
  const p = PROVIDERS[cfg.provider];
  const baseUrl = `${String(org.proxyUrl).replace(/\/+$/, "")}${p.path}`;
  const team = teams.find((x) => x.id === cfg.teamId) ?? teams[0];
  const teamSlug = team?.slug ?? "team-slug";
  const fn = team?.functions[0] ?? "default";
  const examples = codeExamples(cfg.provider, baseUrl, teamSlug, fn, p.model);

  el.innerHTML = `
    <div class="cfg-top">
      <div class="mm-seg" role="group" aria-label="${t("cfg.provider")}">
        ${Object.entries(PROVIDERS).map(([id, x]) => `<button type="button" data-provider="${id}" class="${id === cfg.provider ? "on" : ""}" aria-pressed="${id === cfg.provider}">${x.label}</button>`).join("")}
      </div>
      ${teams.length ? `<label class="cfg-team">${t("cfg.team")}<select class="select-mini" id="cfgTeam">${options(teams.map((x) => ({ value: x.id, label: x.name })), team?.id)}</select></label>` : ""}
    </div>
    ${row("1fr 3fr auto", [`<b>${t("cfg.baseUrl")}</b>`, `<code id="cfgBaseUrl">${escapeHtml(baseUrl)}</code>`,
      `<button class="vbtn ghost small" type="button" data-copy="cfgBaseUrl">${t("set.copyBtn")}</button>`])}
    ${row("1fr 3fr auto", [`<b>${t("cfg.auth")}</b>`,
      `<code>Authorization: Bearer tl_...</code>${cfg.provider === "anthropic" ? ` <span class="muted">${t("cfg.authOr")}</span> <code>x-api-key: tl_...</code>` : ""}
       <div class="vnote" style="margin-top:4px">${t("cfg.authNote")}</div>`, ""])}
    ${row("1fr 3fr auto", [`<b>${t("cfg.headers")}</b>`,
      `<code>X-TL-Team</code> ${t("set.tagTeam")}<br><code>X-TL-Function</code> ${t("set.tagFunction")}<br><code>X-TL-Client</code> ${t("set.tagClient")}`, ""])}
    ${examples.map((ex, i) => `
      <div class="codewrap" style="margin-top:16px">
        <div class="codebar"><span>${ex.label}</span><button class="vbtn ghost small" type="button" data-copy="code-${i}">${t("set.copyCode")}</button></div>
        <pre class="vcode" id="code-${i}"><code>${escapeHtml(ex.code)}</code></pre>
      </div>`).join("")}`;

  el.onclick = (e) => {
    const prov = e.target.closest("[data-provider]");
    const copy = e.target.closest("[data-copy]");
    if (prov) {
      cfg.provider = prov.dataset.provider;
      renderProxyConfig(el, org, teams);
    } else if (copy) {
      const target = el.querySelector(`#${copy.dataset.copy}`);
      copyText(target.textContent, target);
    }
  };
  el.querySelector("#cfgTeam")?.addEventListener("change", (e) => {
    cfg.teamId = e.target.value;
    renderProxyConfig(el, org, teams);
  });
}

/** SDK primeri iz backend/README.md; `tl_...` korisnik menja svojim proxy ključem. */
function codeExamples(provider, baseUrl, team, fn, model) {
  const headersPy = `{"X-TL-Team": "${team}", "X-TL-Function": "${fn}"}`;
  const headersJs = `{ "X-TL-Team": "${team}", "X-TL-Function": "${fn}" }`;
  if (provider === "anthropic") {
    return [
      { label: "Python · Anthropic SDK", code: `from anthropic import Anthropic

client = Anthropic(
    base_url="${baseUrl}",
    api_key="tl_...",
    default_headers=${headersPy},
)

message = client.messages.create(
    model="${model}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Zdravo"}],
)
print(message.content[0].text)` },
      { label: "JavaScript · Anthropic SDK", code: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "${baseUrl}",
  apiKey: "tl_...",
  defaultHeaders: ${headersJs},
});

const message = await client.messages.create({
  model: "${model}",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Zdravo" }],
});
console.log(message.content[0].text);` },
    ];
  }
  return [
    { label: "Python · OpenAI SDK", code: `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}",
    api_key="tl_...",
    default_headers=${headersPy},
)

response = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Zdravo"}],
)
print(response.choices[0].message.content)` },
    { label: "JavaScript · OpenAI SDK", code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}",
  apiKey: "tl_...",
  defaultHeaders: ${headersJs},
});

const response = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Zdravo" }],
});
console.log(response.choices[0].message.content);` },
  ];
}

// ---------- Prozor sa novim ključem (pun ključ se prikazuje samo ovde, jednom) ----------

function showNewKey(name, key) {
  const dialog = document.createElement("dialog");
  dialog.className = "key-dialog";
  dialog.setAttribute("aria-labelledby", "keyDialogTitle");
  dialog.innerHTML = `
    <h2 id="keyDialogTitle">${t("pk.createdTitle")}</h2>
    <p class="vnote" style="margin-top:4px"><b>${escapeHtml(name)}</b></p>
    <div class="key-box">
      <input type="text" readonly id="newKeyValue" aria-label="${t("pk.colKey")}" spellcheck="false" autocomplete="off">
      <button class="vbtn small" type="button" id="copyNewKey">${t("set.copyBtn")}</button>
    </div>
    <p class="key-warning" role="alert">⚠ ${t("pk.onceWarning")}</p>
    <div class="actions"><button class="vbtn ghost" type="button" id="closeKey">${t("pk.close")}</button></div>`;
  document.body.appendChild(dialog);
  // Vrednost se postavlja kao svojstvo, ne kroz HTML, i ne loguje se nigde.
  const input = dialog.querySelector("#newKeyValue");
  input.value = key;
  dialog.querySelector("#copyNewKey").addEventListener("click", () => copyText(input.value, input));
  dialog.querySelector("#closeKey").addEventListener("click", () => dialog.close());
  // Zatvaranje (dugme ili Escape) uklanja prozor i ključ iz stranice.
  dialog.addEventListener("close", () => {
    input.value = "";
    dialog.remove();
  });
  dialog.showModal();
  input.select();
}
