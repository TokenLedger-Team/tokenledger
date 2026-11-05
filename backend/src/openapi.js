// Ručno pisan OpenAPI opis ruta koje backend trenutno ima (ugovor: frontend/API.md).
const err = (d) => ({ description: d, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const json = (schema, d = "OK") => ({ description: d, content: { "application/json": { schema } } });
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const arr = (items) => ({ type: "array", items });
const body = (schema) => ({ required: true, content: { "application/json": { schema } } });
const R = { 401: err("Nema ili je istekao token"), 403: err("Uloga nema pravo"), 400: err("Neispravni podaci"), 404: err("Ne postoji"), 409: err("Već postoji") };
const from = { name: "from", in: "query", required: true, schema: { type: "string", format: "date" }, description: "YYYY-MM-DD, uključivo" };
const to = { name: "to", in: "query", required: true, schema: { type: "string", format: "date" }, description: "YYYY-MM-DD, uključivo" };
const idParam = (name) => ({ name, in: "path", required: true, schema: { type: "string" } });
const str = { type: "string" };
const num = { type: "number" };
const int = { type: "integer" };

export const openapi = {
  openapi: "3.0.3",
  info: { title: "TokenLedger API", version: "0.1.0", description: "Ugovor: frontend/API.md. Greške su uvek `{ message }`. Novac je uvek USD." },
  servers: [{ url: "/api" }],
  security: [{ bearer: [] }],
  tags: ["Auth", "Organizacija", "Statistika", "Budžeti", "Timovi i korisnici", "Modeli", "Uvoz", "Replay i uštede", "Uvidi", "Podešavanja i izveštaji"].map((name) => ({ name })),
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Error: { type: "object", properties: { message: str } },
      User: { type: "object", properties: { id: str, name: str, email: str, role: { type: "string", enum: ["admin", "lead", "observer"] }, teamId: { ...str, nullable: true } } },
      Team: { type: "object", properties: { id: str, name: str, slug: str, functions: arr(str), clients: arr(str) } },
      Model: { type: "object", properties: { id: str, name: str, provider: str, family: str, inputPricePer1M: num, outputPricePer1M: num, contextWindow: str, lowCost: { type: "boolean" } } },
      Budget: { type: "object", properties: { teamId: str, teamName: str, limit: { ...num, nullable: true }, spent: num, dailyAverage: num, forecast: num, status: { type: "string", enum: ["none", "ok", "willExceed", "almost", "over"] } } },
      AlertRules: { type: "object", properties: { warnAtPct: num, emailLeadAtWarn: { type: "boolean" }, emailAdminsAtLimit: { type: "boolean" }, slackAtLimit: { type: "boolean" } } },
      Summary: { type: "object", properties: { from: str, to: str, totalCost: num, totalTokens: int, inputTokens: int, outputTokens: int, requests: int } },
      TimeseriesPoint: { type: "object", properties: { date: str, cost: num, tokens: int, requests: int } },
      BreakdownRow: { type: "object", properties: { key: str, label: { ...str, nullable: true }, teamId: str, teamName: str, cost: num, tokens: int, requests: int } },
      Replay: { type: "object", description: "Dok je status=running, rezultati su null.", properties: { id: str, teamId: str, teamName: str, function: str, sampleSize: int, baseModel: str, candidateModel: str, scoring: { type: "string", enum: ["judge_rules", "rules"] }, status: { type: "string", enum: ["running", "done"] }, createdAt: str, judgeScore: { ...int, nullable: true }, rulesScore: { ...int, nullable: true }, baseLatencyMs: { ...int, nullable: true }, candidateLatencyMs: { ...int, nullable: true }, verdict: { type: "string", enum: ["switch", "check", "dont"], nullable: true }, savingsPerMonth: { ...num, nullable: true }, savingsPct: { ...num, nullable: true } } },
      RoutingRule: { type: "object", properties: { id: str, replayId: str, teamId: str, teamName: str, function: str, fromModel: str, toModel: str, minJudgeScore: int, enabled: { type: "boolean" } } },
      Privacy: { type: "object", properties: { maskPii: { type: "boolean" }, maskedLast7Days: int } },
      ReportStatus: { type: "object", properties: { lastImportAt: { ...str, nullable: true }, lastExportAt: { ...str, nullable: true } } },
      ImportRow: { type: "object", description: "Brojevi stižu kao stringovi iz CSV-a; prazan cost = računa se iz cena.", properties: { date: str, team: str, function: str, client: str, model: str, inputTokens: str, outputTokens: str, cost: str, requests: str } },
    },
  },
  paths: {
    "/auth/login": { post: { tags: ["Auth"], security: [], summary: "Prijava", requestBody: body({ type: "object", required: ["email", "password"], properties: { email: str, password: str, remember: { type: "boolean" } } }), responses: { 200: json({ type: "object", properties: { token: str, user: ref("User") } }), 401: R[401] } } },
    "/auth/signup": { post: { tags: ["Auth"], security: [], summary: "Registracija: pravi novu organizaciju, korisnik postaje admin", requestBody: body({ type: "object", required: ["name", "company", "email", "password"], properties: { name: str, company: str, email: str, password: { type: "string", minLength: 8 } } }), responses: { 201: json({ type: "object", properties: { token: str, user: ref("User") } }), 400: R[400], 409: R[409] } } },
    "/auth/forgot-password": { post: { tags: ["Auth"], security: [], summary: "Uvek isti odgovor; slanje emaila još nije implementirano", requestBody: body({ type: "object", required: ["email"], properties: { email: str } }), responses: { 200: json({ type: "object", properties: { ok: { type: "boolean" } } }) } } },
    "/auth/google": { get: { tags: ["Auth"], security: [], summary: "Google prijava (nije podešena, vraća 501)", responses: { 501: err("Nije podešeno") } } },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Poništava token", responses: { 204: { description: "OK" }, 401: R[401] } } },
    "/auth/me": { get: { tags: ["Auth"], summary: "Trenutni korisnik", responses: { 200: json(ref("User")), 401: R[401] } } },
    "/org": { get: { tags: ["Organizacija"], summary: "Organizacija", responses: { 200: json({ type: "object", properties: { id: str, name: str, proxyUrl: str } }), 401: R[401] } } },
    "/currencies": { get: { tags: ["Organizacija"], summary: "Kursevi (baza USD)", responses: { 200: json({ type: "object", properties: { base: str, rates: { type: "object", additionalProperties: num }, updatedAt: str } }), 401: R[401] } } },
    "/providers": { get: { tags: ["Organizacija"], summary: "Provajderi i njihovi ključevi (samo last4)", responses: { 200: json(arr({ type: "object", properties: { id: str, name: str, connected: { type: "boolean" }, keys: arr({ type: "object", properties: { id: str, environment: str, last4: str } }) } })), 401: R[401] } } },
    "/providers/{id}/keys": { post: { tags: ["Organizacija"], summary: "Dodaje ključ (admin); čuva se šifrovan", parameters: [idParam("id")], requestBody: body({ type: "object", required: ["apiKey"], properties: { apiKey: str, environment: str } }), responses: { 201: json({ type: "object", properties: { id: str, environment: str, last4: str } }), 400: R[400], 401: R[401], 403: R[403], 404: R[404] } } },
    "/providers/{id}/keys/{keyId}": { delete: { tags: ["Organizacija"], summary: "Briše ključ (admin)", parameters: [idParam("id"), idParam("keyId")], responses: { 204: { description: "OK" }, 401: R[401], 403: R[403], 404: R[404] } } },
    "/proxy/status": { get: { tags: ["Organizacija"], summary: "Stanje proxyja", responses: { 200: json({ type: "object", properties: { healthy: { type: "boolean" }, lastCallAt: { ...str, nullable: true } } }), 401: R[401] } } },
    "/stats/summary": { get: { tags: ["Statistika"], summary: "Zbir za period (vođa tima: samo svoj tim)", parameters: [from, to], responses: { 200: json(ref("Summary")), 400: R[400], 401: R[401] } } },
    "/stats/timeseries": { get: { tags: ["Statistika"], summary: "Po danu, uključujući dane sa nulom", parameters: [from, to], responses: { 200: json(arr(ref("TimeseriesPoint"))), 400: R[400], 401: R[401] } } },
    "/stats/breakdown": { get: { tags: ["Statistika"], summary: "Razlaganje po timu/funkciji/klijentu/modelu, opadajuće po trošku", parameters: [from, to, { name: "by", in: "query", required: true, schema: { type: "string", enum: ["team", "function", "client", "model"] } }], responses: { 200: json(arr(ref("BreakdownRow"))), 400: R[400], 401: R[401] } } },
    "/stats/hourly": { get: { tags: ["Statistika"], summary: "Tokeni po satu (24 reda); za danas su budući sati projected", parameters: [{ name: "date", in: "query", schema: { type: "string", format: "date" } }], responses: { 200: json({ type: "object", properties: { date: str, hours: arr({ type: "object", properties: { hour: int, tokens: int, projected: { type: "boolean" } } }) } }), 400: R[400], 401: R[401] } } },
    "/stats/models": { get: { tags: ["Statistika"], summary: "Mapa modela (latencija, opterećenje, protok)", responses: { 200: json(arr({ type: "object" })), 401: R[401] } } },
    "/budgets": { get: { tags: ["Budžeti"], summary: "Budžet po timu (vođa tima: samo svoj)", responses: { 200: json(arr(ref("Budget"))), 401: R[401] } } },
    "/budgets/{teamId}": { put: { tags: ["Budžeti"], summary: "Menja limit (admin)", parameters: [idParam("teamId")], requestBody: body({ type: "object", required: ["limit"], properties: { limit: num } }), responses: { 200: json(ref("Budget")), 400: R[400], 401: R[401], 403: R[403], 404: R[404] } } },
    "/alert-rules": {
      get: { tags: ["Budžeti"], summary: "Pravila upozorenja", responses: { 200: json(ref("AlertRules")), 401: R[401] } },
      put: { tags: ["Budžeti"], summary: "Menja pravila (admin, lead)", requestBody: body(ref("AlertRules")), responses: { 200: json(ref("AlertRules")), 400: R[400], 401: R[401], 403: R[403] } },
    },
    "/teams": {
      get: { tags: ["Timovi i korisnici"], summary: "Timovi (vođa tima: samo svoj)", responses: { 200: json(arr(ref("Team"))), 401: R[401] } },
      post: { tags: ["Timovi i korisnici"], summary: "Novi tim (admin)", requestBody: body({ type: "object", required: ["name"], properties: { name: str } }), responses: { 201: json(ref("Team")), 400: R[400], 401: R[401], 403: R[403], 409: R[409] } },
    },
    "/users": {
      get: { tags: ["Timovi i korisnici"], summary: "Korisnici (admin)", responses: { 200: json(arr(ref("User"))), 401: R[401], 403: R[403] } },
      post: { tags: ["Timovi i korisnici"], summary: "Novi korisnik (admin)", requestBody: body({ type: "object", required: ["name", "email", "role"], properties: { name: str, email: str, password: { type: "string", minLength: 8, description: "Početna lozinka; bez nje korisnik ne može da se prijavi" }, role: str, teamId: { ...str, nullable: true } } }), responses: { 201: json(ref("User")), 400: R[400], 401: R[401], 403: R[403], 409: R[409] } },
    },
    "/users/{id}": {
      put: { tags: ["Timovi i korisnici"], summary: "Menja ime, ulogu, tim (admin)", parameters: [idParam("id")], requestBody: body({ type: "object", properties: { name: str, role: str, teamId: { ...str, nullable: true } } }), responses: { 200: json(ref("User")), 400: R[400], 401: R[401], 403: R[403], 404: R[404] } },
      delete: { tags: ["Timovi i korisnici"], summary: "Briše korisnika (admin, ne sebe)", parameters: [idParam("id")], responses: { 204: { description: "OK" }, 401: R[401], 403: R[403], 404: R[404] } },
    },
    "/models": { get: { tags: ["Modeli"], summary: "Modeli i cene", responses: { 200: json(arr(ref("Model"))), 401: R[401] } } },
    "/models/{id}": { put: { tags: ["Modeli"], summary: "Menja cene (admin); troškovi se preračunavaju", parameters: [idParam("id")], requestBody: body({ type: "object", required: ["inputPricePer1M", "outputPricePer1M"], properties: { inputPricePer1M: num, outputPricePer1M: num } }), responses: { 200: json(ref("Model")), 400: R[400], 401: R[401], 403: R[403], 404: R[404] } } },
    "/usage/import": { post: { tags: ["Uvoz"], summary: "Uvoz potrošnje (admin; lead samo za svoj tim)", requestBody: body({ type: "object", required: ["rows"], properties: { rows: arr(ref("ImportRow")) } }), responses: { 201: json({ type: "object", properties: { imported: int, skipped: int, errors: arr({ type: "object", properties: { row: int, message: str } }) } }), 400: R[400], 401: R[401], 403: R[403] } } },
    "/replays": {
      get: { tags: ["Replay i uštede"], summary: "Replay testovi (vođa tima: samo svoj tim), opadajuće po uštedi. Testovi u toku se završe posle ~6 s.", responses: { 200: json(arr(ref("Replay"))), 401: R[401] } },
      post: { tags: ["Replay i uštede"], summary: "Pokreće replay test (admin; lead za svoj tim). baseModel je model koji funkcija najviše koristi.", requestBody: body({ type: "object", required: ["teamId", "function", "sampleSize", "candidateModel"], properties: { teamId: str, function: str, sampleSize: { type: "integer", minimum: 20, maximum: 1000 }, candidateModel: str, scoring: { type: "string", enum: ["judge_rules", "rules"] } } }), responses: { 201: json(ref("Replay")), 400: R[400], 401: R[401], 403: R[403] } },
    },
    "/stats/optimization": { get: { tags: ["Replay i uštede"], summary: "Ocena optimizacije (0–100); previousScore je procena (score − 9.6), kao u mocku", parameters: [from, to], responses: { 200: json({ type: "object", properties: { score: num, previousScore: num } }), 400: R[400], 401: R[401] } } },
    "/routing-rules": { get: { tags: ["Replay i uštede"], summary: "Routing pravila (nastaju kad replay dobije verdikt switch; početno isključena)", responses: { 200: json(arr(ref("RoutingRule"))), 401: R[401] } } },
    "/routing-rules/{id}": { put: { tags: ["Replay i uštede"], summary: "Uključuje/isključuje pravilo (admin; lead za svoj tim)", parameters: [idParam("id")], requestBody: body({ type: "object", required: ["enabled"], properties: { enabled: { type: "boolean" } } }), responses: { 200: json({ type: "object", properties: { id: str, enabled: { type: "boolean" } } }), 401: R[401], 403: R[403], 404: R[404] } } },
    "/insights/anomalies": { get: { tags: ["Uvidi"], summary: "Anomalije: spike (dnevni trošak > 2.5× proseka prethodnih 7 dana) i retry", responses: { 200: json(arr({ type: "object", description: "type=spike: date, factor; type=retry: failedRetries, hours", properties: { id: str, type: { type: "string", enum: ["spike", "retry"] }, teamId: str, teamName: str, function: str, client: { ...str, nullable: true }, date: str, factor: num, failedRetries: int, hours: int, detectedAt: str } })), 401: R[401] } } },
    "/insights/cache": { get: { tags: ["Uvidi"], summary: "Ponovljeni upiti i procena uštede keširanjem (repeatShare dok nema proxyja dolazi iz seeda)", responses: { 200: json({ type: "object", properties: { repeatShare: num, estMonthlySavings: num, largestSource: { type: "object", nullable: true, properties: { teamName: str, function: str } } } }), 401: R[401] } } },
    "/insights/forecast": { get: { tags: ["Uvidi"], summary: "Projekcija za tekući mesec (zbir za timove koje korisnik vidi)", responses: { 200: json({ type: "object", properties: { month: str, projected: num, budget: num } }), 401: R[401] } } },
    "/settings/privacy": {
      get: { tags: ["Podešavanja i izveštaji"], summary: "Maskiranje ličnih podataka", responses: { 200: json(ref("Privacy")), 401: R[401] } },
      put: { tags: ["Podešavanja i izveštaji"], summary: "Menja maskiranje (admin)", requestBody: body({ type: "object", properties: { maskPii: { type: "boolean" } } }), responses: { 200: json(ref("Privacy")), 401: R[401], 403: R[403] } },
    },
    "/reports/status": { get: { tags: ["Podešavanja i izveštaji"], summary: "Poslednji uvoz i izvoz", responses: { 200: json(ref("ReportStatus")), 401: R[401] } } },
    "/reports/exports": { post: { tags: ["Podešavanja i izveštaji"], summary: "Beleži izvoz (sam fajl pravi frontend)", requestBody: body({ type: "object", required: ["format"], properties: { format: { type: "string", enum: ["csv", "pdf"] } } }), responses: { 201: json(ref("ReportStatus")), 400: R[400], 401: R[401] } } },
  },
};
