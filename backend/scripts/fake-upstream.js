// Lažni OpenAI/Anthropic za testiranje proxyja bez pravih ključeva.
// Pokretanje: FAKE_PORT=9100 node scripts/fake-upstream.js
// Model "fail-*" u telu vraća grešku 429; ostalo vraća odgovor sa usage poljem.
import express from "express";

const app = express();
app.use(express.json());
const sse = (res, events) => {
  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache" });
  res.flushHeaders();
  let i = 0;
  const t = setInterval(() => {
    if (i >= events.length) return clearInterval(t), res.end();
    const [name, data] = events[i++];
    res.write(`${name ? `event: ${name}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
  }, 20);
};

app.post("/v1/chat/completions", (req, res) => {
  const b = req.body;
  if (String(b.model).startsWith("fail")) return res.status(429).json({ error: { message: "rate limited", type: "rate_limit" } });
  const model = `${b.model}-2024-07-18`;
  if (!b.stream) {
    return res.json({ id: "c1", model, choices: [{ message: { role: "assistant", content: "zdravo" } }], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }, _auth: req.get("authorization"), _opts: b.stream_options ?? null });
  }
  const chunk = (extra) => ({ id: "c1", model, ...extra });
  const events = [[null, chunk({ choices: [{ delta: { content: "zdr" } }], usage: null })], [null, chunk({ choices: [{ delta: { content: "avo" } }], usage: null })]];
  if (b.stream_options?.include_usage) events.push([null, chunk({ choices: [], usage: { prompt_tokens: 21, completion_tokens: 5, total_tokens: 26 } })]);
  events.push([null, "[DONE]"]);
  sse(res, events);
});

app.post("/v1/responses", (req, res) => res.json({ id: "r1", model: "gpt-4.1-2025-04-14", usage: { input_tokens: 30, output_tokens: 12 } }));

app.post("/v1/messages", (req, res) => {
  const b = req.body;
  const model = "claude-3-5-haiku-20241022";
  if (req.get("x-api-key") === undefined) return res.status(401).json({ type: "error", error: { message: "no key" } });
  if (!b.stream) return res.json({ id: "m1", type: "message", model, content: [{ type: "text", text: "zdravo" }], usage: { input_tokens: 14, output_tokens: 9 }, _key: req.get("x-api-key"), _ver: req.get("anthropic-version") });
  sse(res, [
    ["message_start", { type: "message_start", message: { id: "m1", model, usage: { input_tokens: 25, output_tokens: 1 } } }],
    ["content_block_delta", { type: "content_block_delta", delta: { text: "zdr" } }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 15 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
});

const port = Number(process.env.FAKE_PORT) || 9100;
app.listen(port, () => console.log(`Lažni upstream: http://localhost:${port}`));
