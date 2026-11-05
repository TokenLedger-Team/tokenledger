import * as api from "../api.js";
import { startPage } from "../layout.js";
import { t } from "../i18n.js";
import { chip, row, hrow, options, busy } from "../ui.js";
import { escapeHtml, humanize, toast, showError } from "../format.js";

const ROLES = ["admin", "lead", "observer"];
let snippetTeam = null;

startPage({
  id: "setup",
  async load() {
    const [org, providers, teams, users] = await Promise.all([api.getOrg(), api.getProviders(), api.getTeams(), api.getUsers()]);
    return { org, providers, teams, users };
  },
  render(root, { org, providers, teams, users }, ctx) {
    const step = (n, title, sub) =>
      `<div class="stp"><span class="stp-n">${n}</span><div><div class="stp-t">${title}</div><div class="subheading">${sub}</div></div></div>`;
    const keys = providers.flatMap((p) => p.keys.map((k) => ({ ...k, provider: p })));
    const team = teams.find((x) => x.id === snippetTeam) ?? teams[0];
    const teamItems = [{ value: "", label: t("set.noTeam") }, ...teams.map((x) => ({ value: x.id, label: x.name }))];
    const roleItems = ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }));
    const userCols = "1.2fr 1.6fr 1fr 1fr auto";

    root.innerHTML = `<div class="views"><div class="vgrid">
      <article class="card"><div class="card-kicker">${t("set.how")}</div><h2 class="stp-h">${t("set.howTitle")}</h2>
        <p class="rp-p">${t("set.howText")}</p>
        <div class="flow"><span>${t("set.yourApp")}</span><i aria-hidden="true">→</i><span class="hl">${t("set.proxy")}</span><i aria-hidden="true">→</i><span>${providers.map((p) => escapeHtml(p.name)).join(" · ")}</span></div>
      </article>

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

      <article class="card h6">${step(2, t("set.step2"), t("set.step2Sub"))}
        ${hrow("1.1fr 1fr 1.6fr 1.2fr", [t("set.colTeam"), t("set.colSlug"), t("set.colFunctions"), t("set.colClients")])}
        ${teams.map((x) => row("1.1fr 1fr 1.6fr 1.2fr", [`<b>${escapeHtml(x.name)}</b>`, `<code>${escapeHtml(x.slug)}</code>`, String(x.functions.length), x.clients.map((c) => escapeHtml(humanize(c))).join(", ") || "—"])).join("")}
        <form class="vform" id="teamForm"><label>${t("set.teamName")}<input type="text" name="name" required></label><button class="vbtn" type="submit">${t("set.addTeam")}</button></form>
      </article>

      <article class="card">${step(3, t("set.step3"), t("set.step3Sub"))}
        <div class="codewrap"><div class="codebar"><span>${t("set.paste")}</span>
          <span style="display:flex;gap:8px"><select class="select-mini" id="snippetTeam" aria-label="${t("set.colTeam")}">${options(teams.map((x) => ({ value: x.id, label: x.name })), team?.id)}</select>
          <button class="vbtn ghost small" type="button" id="copyBtn">${t("set.copy")}</button></span></div>
          <div class="vcode" id="snippet"><span class="ck">base_url:</span>        ${escapeHtml(org.proxyUrl)}
<span class="ck">X-TL-Team:</span>       ${escapeHtml(team?.slug ?? "team")}
<span class="ck">X-TL-Function:</span>   ${escapeHtml(team?.functions[0] ?? "function-name")}
<span class="ck">X-TL-Client:</span>     ${escapeHtml(team?.clients[0] ?? "client-name")}</div></div>
        <div class="tagleg">
          ${row("1.1fr 2.4fr", ["<b>X-TL-Team</b>", t("set.tagTeam")])}
          ${row("1.1fr 2.4fr", ["<b>X-TL-Function</b>", t("set.tagFunction")])}
          ${row("1.1fr 2.4fr", ["<b>X-TL-Client</b>", t("set.tagClient")])}
        </div>
      </article>

      <article class="card">${step(4, t("set.step4"), t("set.step4Sub"))}
        <div class="vtiles rl">${ROLES.map((r) => `<div class="vtile"><strong>${t(`role.${r}`)}</strong><p>${t(`set.role${r[0].toUpperCase()}${r.slice(1)}`)}</p></div>`).join("")}</div>
        <h3 class="card-kicker" style="margin:24px 0 4px">${t("set.people")}</h3>
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
      if (!keyBtn && !userBtn) return;
      if (!confirm(t("common.confirmDelete"))) return;
      try {
        if (keyBtn) {
          const [providerId, keyId] = keyBtn.dataset.delKey.split("|");
          await api.deleteProviderKey(providerId, keyId);
        } else {
          await api.deleteUser(userBtn.dataset.delUser);
        }
        toast(t("common.deleted"));
        ctx.reload();
      } catch (err) {
        showError(err);
      }
    };

    root.querySelector("#snippetTeam")?.addEventListener("change", (e) => {
      snippetTeam = e.target.value;
      ctx.rerender();
    });
    root.querySelector("#copyBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(root.querySelector("#snippet").textContent);
        toast(t("set.copied"));
      } catch {
        toast(t("set.copyFail"), "error");
      }
    });
  },
});
