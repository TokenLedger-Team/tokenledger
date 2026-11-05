// Proxy za AI pozive: prosleđuje zahtev provajdera (OpenAI / Anthropic) sa pravim ključem organizacije,
// vraća odgovor netaknut i beleži potrošnju. Ne loguje tela zahteva ni ključeve.
import { Router } from "express";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "../db.js";
import { config } from "../config.js";
import { decrypt } from "../services/crypto.js";
import { orgByProxyKey } from "../services/proxyKeys.js";
import { recordCall, recordFailure, tagsFrom } from "../services/proxyUsage.js";

export const router = Router();

const TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = "2023-06-01";

// Samo ove destinacije; host dolazi isključivo iz env-a, nikad iz zahteva.
const ROUTES = [
  { path: "/openai/v1/chat/completions", provider: "openai", upstream: "/v1/chat/completions", chat: true },
  { path: "/openai/v1/responses", provider: "openai", upstream: "/v1/responses" },
  { path: "/anthropic/v1/messages", provider: "anthropic", upstream: "/v1/messages" },
];
const baseOf = (provider) => (provider === "openai" ? config.openaiBaseUrl : config.anthropicBaseUrl);

// Zaglavlja klijenta koja se prosleđuju; x-forwarded-*, cookie, host i ključevi klijenta se ne prosleđuju.
const PASS = {
  openai: ["content-type", "accept", "openai-organization", "openai-project", "openai-beta", "user-agent"],
  anthropic: ["content-type", "accept", "anthropic-beta", "user-agent"],
};
const DROP_RESPONSE = new Set(["content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive", "set-cookie"]);

const reject = (res, status, message, type) => res.status(status).json({ message, error: { message, type } });

function proxyAuth(req, res, next) {
  const bearer = /^Bearer (.+)$/i.exec(req.get("authorization") || "")?.[1];
  const orgId = orgByProxyKey(bearer?.trim()) ?? orgByProxyKey(req.get("x-api-key")?.trim());
  if (!orgId) return reject(res, 401, "Invalid or missing TokenLedger proxy key.", "invalid_api_key");
  req.proxyOrgId = orgId;
  next();
}

/** Skuplja model i tokene iz JSON objekta (odgovor ili SSE događaj) oba provajdera. */
function absorb(acc, o) {
  if (!o || typeof o !== "object") return;
  const src = o.type === "message_start" && o.message ? o.message : o.response && typeof o.response === "object" ? o.response : o;
  if (typeof src.model === "string") acc.model = src.model;
  const u = o.type === "message_delta" ? o.usage : src.usage;
  if (!u || typeof u !== "object") return;
  const inp = u.prompt_tokens ?? u.input_tokens;
  const out = u.completion_tokens ?? u.output_tokens;
  if (Number.isFinite(inp)) acc.input = inp;
  if (Number.isFinite(out)) acc.output = out;
  acc.seen = true;
}

/** Inkrementalni parser SSE toka; poziva absorb za svaku `data:` liniju koja je JSON. */
function sseTap(acc) {
  const dec = new TextDecoder();
  let rest = "";
  const line = (l) => {
    if (!l.startsWith("data:")) return;
    const d = l.slice(5).trim();
    if (!d || d === "[DONE]") return;
    try {
      absorb(acc, JSON.parse(d));
    } catch {
      /* nepotpun ili ne-JSON događaj se preskače */
    }
  };
  return (chunk) => {
    rest += dec.decode(chunk, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop();
    lines.forEach((l) => line(l.replace(/\r$/, "")));
  };
}

function providerKey(orgId, provider) {
  const row = db.prepare("SELECT encrypted_key FROM provider_keys WHERE org_id = ? AND provider_id = ? AND environment = 'production'").get(orgId, provider);
  return row ? decrypt(row.encrypted_key) : null;
}

const safe = (what, fn) => {
  try {
    fn();
  } catch (e) {
    console.error(`[proxy] ${what}: ${e.message}`); // samo poruka, nikad telo ili ključ
  }
};

function handler({ provider, upstream, chat }) {
  return async (req, res) => {
    const orgId = req.proxyOrgId;
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return reject(res, 400, "Request body must be a JSON object.", "invalid_request_error");

    const key = providerKey(orgId, provider);
    if (!key) return reject(res, 502, `No production ${provider} key is connected in TokenLedger.`, "provider_key_missing");

    const wantsStream = body.stream === true;
    if (chat && wantsStream && body.stream_options?.include_usage === undefined) {
      body.stream_options = { ...(body.stream_options || {}), include_usage: true };
    }

    const headers = {};
    for (const h of PASS[provider]) if (req.get(h)) headers[h] = req.get(h);
    headers["content-type"] = "application/json";
    if (provider === "openai") headers.authorization = `Bearer ${key}`;
    else {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = req.get("anthropic-version") || ANTHROPIC_VERSION;
    }

    const tags = tagsFrom(req);
    const started = Date.now();
    const ac = new AbortController();
    let timedOut = false;
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ((timedOut = true), ac.abort()), TIMEOUT_MS);
    };
    res.on("close", () => {
      if (!res.writableFinished) ac.abort(); // klijent je prekinuo
    });

    const fail = () => safe("failure log", () => recordFailure({ orgId, tags }));
    let up;
    arm();
    try {
      up = await fetch(baseOf(provider) + upstream, { method: "POST", headers, body: JSON.stringify(body), signal: ac.signal, redirect: "manual" });
    } catch {
      clearTimeout(timer);
      if (res.headersSent || res.destroyed) return;
      fail();
      return timedOut ? reject(res, 504, "Upstream provider timed out.", "timeout") : reject(res, 502, "Could not reach upstream provider.", "bad_gateway");
    }

    res.status(up.status);
    up.headers.forEach((v, k) => {
      if (!DROP_RESPONSE.has(k)) res.setHeader(k, v);
    });

    const acc = { model: null, input: 0, output: 0, seen: false };
    const record = () => {
      if (!acc.seen) return console.warn(`[proxy] ${provider}: odgovor bez usage podataka, poziv nije zabeležen`);
      safe("usage log", () =>
        recordCall({ orgId, provider, tags, model: acc.model || String(body.model || "unknown"), inputTokens: acc.input, outputTokens: acc.output, latencyMs: Date.now() - started })
      );
    };

    const isSSE = (up.headers.get("content-type") || "").includes("text/event-stream");
    if (up.ok && isSSE && up.body) {
      res.flushHeaders();
      const feed = sseTap(acc);
      const tap = new Transform({
        transform(chunk, _enc, cb) {
          arm(); // rok od 120 s važi između delova toka
          feed(chunk);
          cb(null, chunk);
        },
      });
      try {
        await pipeline(Readable.fromWeb(up.body), tap, res);
        clearTimeout(timer);
        record();
      } catch {
        clearTimeout(timer); // prekid klijenta ili tajmaut usred toka: odgovor je već krenuo
        if (acc.seen) record();
        if (!res.writableEnded) res.end();
      }
      return;
    }

    let buf;
    try {
      buf = Buffer.from(await up.arrayBuffer());
    } catch {
      clearTimeout(timer);
      res.removeHeader("content-type");
      fail();
      return timedOut ? reject(res, 504, "Upstream provider timed out.", "timeout") : reject(res, 502, "Upstream response failed.", "bad_gateway");
    }
    clearTimeout(timer);
    res.end(buf);

    if (!up.ok) return fail();
    safe("parse", () => absorb(acc, JSON.parse(buf.toString("utf8"))));
    record();
  };
}

for (const r of ROUTES) router.post(r.path, proxyAuth, handler(r));
