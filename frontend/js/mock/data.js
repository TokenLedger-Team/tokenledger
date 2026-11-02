// Početni podaci za lažni backend. Sve ovde je izmišljeno i služi samo za demo.
// Oblici podataka su isti kao u frontend/API.md.

import { addDays, todayISO, parseISODate } from "../format.js";

export const ORG = { id: "org-1", name: "Acme Corp", proxyUrl: "https://proxy.tokenledger.example/v1" };

export const CURRENCIES = { base: "USD", rates: { USD: 1, EUR: 0.92, RSD: 108 } };

// Cene su ilustrativne (USD po 1M tokena), nisu trenutne cene provajdera.
export const MODELS = [
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", family: "GPT", inputPricePer1M: 2.5, outputPricePer1M: 10, contextWindow: "128k" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "OpenAI", family: "GPT", inputPricePer1M: 0.15, outputPricePer1M: 0.6, contextWindow: "128k" },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "OpenAI", family: "GPT", inputPricePer1M: 2, outputPricePer1M: 8, contextWindow: "1M" },
  { id: "claude-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", family: "Claude", inputPricePer1M: 3, outputPricePer1M: 15, contextWindow: "200k" },
  { id: "claude-haiku", name: "Claude Haiku", provider: "Anthropic", family: "Claude", inputPricePer1M: 0.8, outputPricePer1M: 4, contextWindow: "200k" },
  { id: "gemini-pro", name: "Gemini 1.5 Pro", provider: "Google", family: "Gemini", inputPricePer1M: 1.25, outputPricePer1M: 5, contextWindow: "2M" },
  { id: "gemini-flash", name: "Gemini Flash", provider: "Google", family: "Gemini", inputPricePer1M: 0.075, outputPricePer1M: 0.3, contextWindow: "1M" },
  { id: "llama-70b", name: "Llama 3.1 70B", provider: "Azure", family: "Llama", inputPricePer1M: 0.9, outputPricePer1M: 0.9, contextWindow: "128k" },
];

// Latencija (ms), opterećenje (%) i protok (zahteva/min) van vršnog i u vršnom periodu.
export const FLEET = {
  "gpt-4o": { offPeak: [380, 41, 18000], peak: [640, 86, 42000] },
  "gpt-4o-mini": { offPeak: [190, 30, 22000], peak: [260, 62, 46000] },
  "gpt-4.1": { offPeak: [420, 35, 9000], peak: [610, 71, 21000] },
  "claude-sonnet": { offPeak: [460, 38, 12000], peak: [820, 91, 29000] },
  "claude-haiku": { offPeak: [210, 28, 14000], peak: [300, 58, 31000] },
  "gemini-pro": { offPeak: [510, 30, 7000], peak: [690, 64, 16000] },
  "gemini-flash": { offPeak: [230, 26, 10000], peak: [330, 55, 24000] },
  "llama-70b": { offPeak: [540, 34, 5000], peak: [980, 89, 11000] },
};

export const TEAMS = [
  { id: "t-support", name: "Support", slug: "support" },
  { id: "t-eng", name: "Engineering", slug: "engineering" },
  { id: "t-mkt", name: "Marketing", slug: "marketing" },
  { id: "t-data", name: "Data", slug: "data" },
];

// Jedan "tok" = jedna funkcija jednog tima na jednom modelu (ono što proxy vidi preko oznaka).
// req = zahteva dnevno radnim danom, inTok/outTok = prosečno tokena po zahtevu.
const STREAMS = [
  { teamId: "t-support", fn: "ticket-classification", client: null, model: "gpt-4o", req: 52000, inTok: 900, outTok: 60 },
  { teamId: "t-support", fn: "chat-assistant", client: "acme", model: "gpt-4o", req: 9000, inTok: 2500, outTok: 400 },
  { teamId: "t-support", fn: "faq-answers", client: null, model: "gpt-4o-mini", req: 30000, inTok: 1200, outTok: 250 },
  { teamId: "t-eng", fn: "code-review", client: null, model: "claude-sonnet", req: 4200, inTok: 6000, outTok: 900 },
  { teamId: "t-eng", fn: "doc-summarization", client: null, model: "claude-sonnet", req: 3000, inTok: 8000, outTok: 600 },
  { teamId: "t-eng", fn: "test-generation", client: null, model: "gpt-4.1", req: 2200, inTok: 4000, outTok: 1500 },
  { teamId: "t-mkt", fn: "client-campaigns", client: "acme", model: "claude-sonnet", req: 1800, inTok: 3000, outTok: 1200 },
  { teamId: "t-mkt", fn: "copywriting", client: "globex", model: "gpt-4o", req: 4000, inTok: 1500, outTok: 800 },
  { teamId: "t-mkt", fn: "image-captions", client: null, model: "gemini-pro", req: 6000, inTok: 1200, outTok: 150 },
  { teamId: "t-data", fn: "enrichment", client: "initech", model: "gemini-flash", req: 90000, inTok: 1500, outTok: 200 },
  { teamId: "t-data", fn: "tagging-routing", client: null, model: "gpt-4o", req: 30000, inTok: 600, outTok: 40 },
  { teamId: "t-data", fn: "extraction", client: null, model: "claude-haiku", req: 14000, inTok: 3000, outTok: 300 },
  { teamId: "t-eng", fn: "internal-chat", client: null, model: "llama-70b", req: 3000, inTok: 2000, outTok: 500 },
];

// Udeo dnevnih tokena po satu (0-23), tipičan radni dan.
export const HOUR_CURVE = [
  0.4, 0.3, 0.25, 0.25, 0.3, 0.5, 1.2, 2.6, 4.8, 6.9, 8.6, 8.1, 6.4, 7.2, 7.9, 7.1, 6.0, 4.6, 3.2, 2.4, 1.8, 1.3, 0.9, 0.6,
];

function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pravi dnevne zbirove potrošnje za poslednjih `days` dana, zaključno sa danas.
 * Red: { date, teamId, function, client, model, requests, inputTokens, outputTokens, source: "proxy" }
 * Trošak se NE čuva; računa se iz tabele cena (tako "izmena cena preračunava troškove").
 */
export function generateUsage(days = 180) {
  const rand = seededRandom(7);
  const today = todayISO();
  const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const dow = parseISODate(date).getDay();
    const weekend = dow === 0 || dow === 6;
    const trend = 1 + (days - i) / days / 4; // blagi rast kroz vreme
    for (const s of STREAMS) {
      let factor = (weekend ? 0.35 : 1) * trend * (0.8 + rand() * 0.4);
      // Jedan namerni skok za demo anomalija: Marketing · client-campaigns pre 3 dana.
      if (i === 3 && s.fn === "client-campaigns") factor *= 3.4;
      // Danas se računa samo deo dana koji je prošao.
      if (i === 0) factor *= HOUR_CURVE.slice(0, Math.floor(nowHour)).reduce((a, b) => a + b, 0) / 100;
      const requests = Math.round(s.req * factor);
      rows.push({
        date,
        teamId: s.teamId,
        function: s.fn,
        client: s.client,
        model: s.model,
        requests,
        inputTokens: Math.round(requests * s.inTok * (0.9 + rand() * 0.2)),
        outputTokens: Math.round(requests * s.outTok * (0.9 + rand() * 0.2)),
        source: "proxy",
      });
    }
  }
  return rows;
}

export const USERS = [
  { id: "u1", name: "Ana Petrović", email: "admin@firma.rs", role: "admin", teamId: null },
  { id: "u2", name: "Marko Jovanović", email: "lead@firma.rs", role: "lead", teamId: "t-support" },
  { id: "u3", name: "Jelena Nikolić", email: "observer@firma.rs", role: "observer", teamId: null },
  { id: "u4", name: "Stefan Ilić", email: "stefan@firma.rs", role: "lead", teamId: "t-eng" },
  { id: "u5", name: "Milica Đorđević", email: "milica@firma.rs", role: "lead", teamId: "t-mkt" },
  { id: "u6", name: "Nikola Stojanović", email: "nikola@firma.rs", role: "observer", teamId: "t-data" },
];

export const PROVIDERS = [
  { id: "openai", name: "OpenAI", keys: [{ id: "k1", environment: "production", last4: "3f9a" }] },
  { id: "anthropic", name: "Anthropic", keys: [{ id: "k2", environment: "production", last4: "b21c" }] },
  { id: "google", name: "Google", keys: [{ id: "k3", environment: "staging", last4: "7d04" }] },
  { id: "azure", name: "Azure", keys: [] },
];

export const REPLAYS = [
  { id: "r1", teamId: "t-support", function: "ticket-classification", sampleSize: 200, baseModel: "gpt-4o", candidateModel: "gpt-4o-mini", scoring: "judge_rules", judgeScore: 94, rulesScore: 98, baseLatencyMs: 640, candidateLatencyMs: 260 },
  { id: "r2", teamId: "t-eng", function: "doc-summarization", sampleSize: 150, baseModel: "claude-sonnet", candidateModel: "claude-haiku", scoring: "judge_rules", judgeScore: 86, rulesScore: 93, baseLatencyMs: 820, candidateLatencyMs: 300 },
  { id: "r3", teamId: "t-support", function: "chat-assistant", sampleSize: 200, baseModel: "gpt-4o", candidateModel: "gpt-4o-mini", scoring: "judge_rules", judgeScore: 71, rulesScore: 80, baseLatencyMs: 640, candidateLatencyMs: 260 },
  { id: "r4", teamId: "t-data", function: "tagging-routing", sampleSize: 300, baseModel: "gpt-4o", candidateModel: "gpt-4o-mini", scoring: "judge_rules", judgeScore: 96, rulesScore: 99, baseLatencyMs: 640, candidateLatencyMs: 260 },
];

// Faktor početnog limita u odnosu na potrošnju poslednjih 30 dana (da demo ima razne statuse).
export const LIMIT_FACTOR = { "t-support": 1.25, "t-eng": 1.02, "t-mkt": 0.85, "t-data": 1.6 };
