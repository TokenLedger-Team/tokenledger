# API koji frontend očekuje

Ovaj dokument je **dogovor između frontend i backend tima**. Frontend već poziva tačno ove endpointe i očekuje tačno ove oblike podataka.

Dok backend ne bude gotov, iste endpointe glumi **mock**: `js/mock/server.js` je lažni backend koji radi u browseru. Nije pravi server, služi samo da frontend radi i da ovde opisano ponašanje ima primer koji može da se pokrene.

> **Za backend tim**
> - Tehnologiju birate vi. Frontend je obični HTML/CSS/JS i treba mu samo JSON.
> - Ako vam nešto ne odgovara (ime polja, ruta, oblik), javite nam, pa ćemo promeniti. Na frontendu se sve menja na jednom mestu: `js/api.js`.
> - Endpointi su grupisani po modulima, pa ih možete raditi redom. Šta je obavezno za MVP, a šta može kasnije, piše u [Prioriteti](#prioriteti).

## Sadržaj
- [Opšta pravila](#opšta-pravila)
- [Uloge i prava](#uloge-i-prava)
- [Modeli podataka](#modeli-podataka)
- [Endpointi](#endpointi)
- [Pravila obračuna](#pravila-obračuna)
- [Prioriteti](#prioriteti)
- [Kako povezati pravi backend](#kako-povezati-pravi-backend)
- [Otvorena pitanja](#otvorena-pitanja)

---

## Opšta pravila

| Stavka | Dogovor |
|---|---|
| Bazni URL | `http://localhost:8000/api` (menja se u `js/config.js`) |
| Format | JSON u oba smera |
| Autentikacija | `Authorization: Bearer <token>` na svakom zahtevu osim `/auth/login`, `/auth/signup`, `/auth/forgot-password` i `/auth/google` |
| Jezik | Frontend šalje `Accept-Language: sr` ili `en`. Poruke o greškama (`message`) bi trebalo da budu na tom jeziku. |
| Datumi | Dan je `"YYYY-MM-DD"`, vreme je ISO 8601 (`"2026-11-02T10:15:00Z"`). Opsezi `from` i `to` su **uključivi**. |
| Novac | **Uvek USD**, kao broj sa 2 decimale. Frontend sam preračunava u EUR/RSD (vidi `/currencies`). |
| ID-jevi | Stringovi |
| Greške | Status 4xx/5xx i telo `{ "message": "..." }`. Frontend tu poruku prikazuje korisniku. |
| 401 | Frontend briše sesiju i vraća korisnika na `login.html` |
| 403 | Uloga nema pravo, a frontend prikazuje `message` |
| Brisanje | `204 No Content` |
| CORS | Ako frontend radi na drugom portu (npr. `http://localhost:5500`), dozvolite taj origin i headere `Authorization`, `Content-Type`, `Accept-Language`. |

---

## Uloge i prava

Postoje tri uloge (iz dizajna): `admin`, `lead` (vođa tima) i `observer` (posmatrač).

**Frontend samo sakriva dugmad i stranice. Backend MORA sam da proveri prava na svakom zahtevu.**

| | admin | lead | observer |
|---|---|---|---|
| Moduli u meniju | svih 7 | Pregled, Budžeti, Replay, Uvidi, Izveštaji | Pregled, Budžeti, Replay |
| Koje podatke vidi | celu firmu | **samo svoj tim** (`user.teamId`) | celu firmu |
| Menja limite budžeta | ✅ | ❌ | ❌ |
| Menja pravila upozorenja | ✅ | ✅ | ❌ |
| Pokreće replay testove | ✅ | ✅ za svoj tim | ❌ |
| Uključuje auto-routing | ✅ | ✅ za svoj tim | ❌ |
| Maskiranje ličnih podataka | ✅ | ❌ | ❌ |
| Uvoz CSV-a | ✅ | ✅ za svoj tim | ❌ |
| Ključevi, timovi, korisnici, cene | ✅ | ❌ | ❌ |

"Samo svoj tim" znači da **svi** endpointi sa podacima (`/stats/*`, `/budgets`, `/replays`, `/insights/*`, `/routing-rules`, `/teams`) za vođu tima vraćaju samo njegov tim.

---

## Modeli podataka

### User
```json
{ "id": "u2", "name": "Marko Jovanović", "email": "lead@firma.rs", "role": "lead", "teamId": "t-support" }
```
`teamId` može biti `null`. Lozinka se nikad ne vraća.

### Team
```json
{ "id": "t-support", "name": "Support", "slug": "support", "functions": ["chat-assistant", "faq-answers"], "clients": ["acme"] }
```
`slug` je vrednost koju aplikacija šalje u headeru `X-TL-Team`. Liste `functions` i `clients` su vrednosti koje je proxy video u headerima `X-TL-Function` i `X-TL-Client` za taj tim.

### Model (cene)
```json
{ "id": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI", "family": "GPT",
  "inputPricePer1M": 2.5, "outputPricePer1M": 10, "contextWindow": "128k", "lowCost": false }
```
- `family` se koristi za grupisanje i boje na mapi modela. Trenutno: GPT, Claude, Gemini, Llama.
- `lowCost` je oznaka jeftinog modela. U mocku je to `inputPricePer1M <= 0.8`, a backend može imati svoje pravilo.

### Zapis potrošnje (šta proxy beleži)
Frontend nikad ne dobija pojedinačne pozive, samo zbirove (vidi `/stats/*`). Backend interno treba da čuva barem:
```
date/time, teamId, function, client, model, requests, inputTokens, outputTokens, cost (USD), latencyMs, source ("proxy" | "import")
```
**Trošak se računa iz tabele cena.** Kada admin promeni cenu, troškovi se preračunavaju (tako piše u dizajnu). Uvezeni redovi mogu imati svoj `cost`.

---

## Endpointi

### Autentikacija
| Metod | Ruta | Telo | Odgovor |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password, remember }` | `{ token, user }` ili `401` |
| POST | `/auth/signup` | `{ name, company, email, password }` | `201 { token, user }`. Pravi novu organizaciju, a korisnik postaje `admin`. `409` ako email postoji. |
| POST | `/auth/forgot-password` | `{ email }` | `200 { ok: true }`, **uvek** isto (da se ne otkriva da li nalog postoji) |
| GET | `/auth/google` | – | Preusmerava na Google. Posle uspeha backend vraća korisnika na `login.html?token=<token>`. |
| POST | `/auth/logout` | – | `204` (poništava token) |
| GET | `/auth/me` | – | `User` |

### Organizacija, valute, provajderi, proxy
| Metod | Ruta | Odgovor |
|---|---|---|
| GET | `/org` | `{ id, name, proxyUrl }`. `proxyUrl` se prikazuje u uputstvu za povezivanje aplikacije. |
| GET | `/currencies` | `{ base: "USD", rates: { USD: 1, EUR: 0.92, RSD: 108 }, updatedAt }` |
| GET | `/providers` | `[{ id: "openai", name: "OpenAI", connected: true, keys: [{ id, environment: "production", last4: "3f9a" }] }]` |
| POST | `/providers/:id/keys` | Telo je `{ apiKey, environment }`, a odgovor `201 { id, environment, last4 }`. **Ključ se čuva šifrovano i nikad se ne vraća ceo.** Novi ključ zamenjuje stari za isto okruženje. |
| DELETE | `/providers/:id/keys/:keyId` | `204` |
| GET | `/proxy/status` | `{ healthy: true, lastCallAt }`; `lastCallAt` je `null` dok nema poziva (donji levi ugao menija) |
| GET | `/proxy-keys` | `[{ id, name, last4, createdAt }]` (samo admin) |
| POST | `/proxy-keys` | Telo je `{ name }` (1–80 znakova), a odgovor `201 { id, name, last4, createdAt, key }`. **Pun `key` (`tl_...`) stiže samo ovde, jednom**; frontend ga prikazuje u prozoru i ne čuva ga. |
| DELETE | `/proxy-keys/:id` | `204`; aplikacije sa tim ključem dobijaju `401` |

Uputstvo u Podešavanjima gradi adrese proxyja iz `proxyUrl`: OpenAI `proxyUrl + /openai/v1`, Anthropic `proxyUrl + /anthropic` (SDK primeri prate `backend/README.md`).

Provajderi koje frontend zna da prikaže: `openai`, `anthropic`, `google`, `azure`. Ostali dobijaju prvo slovo kao ikonicu. `connected` je `true` ako postoji `production` ključ.

### Statistika (Pregled)
Svi parametri `from` i `to` su obavezni. Frontend uvek traži i **prethodni period iste dužine**, da bi pokazao promenu u procentima.

**`GET /stats/summary?from=&to=`**
```json
{ "from": "2026-10-27", "to": "2026-11-02", "totalCost": 5410.89, "totalTokens": 3060000000,
  "inputTokens": 2700000000, "outputTokens": 360000000, "requests": 1800000 }
```

**`GET /stats/timeseries?from=&to=`**: jedan red po danu, **uključujući dane bez potrošnje (nule)**, rastuće po datumu.
```json
[{ "date": "2026-10-27", "cost": 812.4, "tokens": 450000000, "requests": 260000 }]
```

**`GET /stats/breakdown?from=&to=&by=team|function|client|model`**: sortirano po `cost`, opadajuće.
```json
[{ "key": "t-support:faq-answers", "label": "faq-answers", "teamId": "t-support", "teamName": "Support",
   "cost": 1023.1, "tokens": 400000000, "requests": 300000 }]
```
- `by=team`: `key` je teamId, `label` je naziv tima.
- `by=function`: `key` je `teamId:function`, `label` je slug funkcije, a `teamId` i `teamName` su obavezni.
- `by=client`: `key` je slug klijenta ili `""`, a `label` je slug ili `null` za pozive bez klijenta.
- `by=model`: `key` je id modela, `label` je naziv modela.

**`GET /stats/hourly?date=YYYY-MM-DD`**: 24 reda (sati 0 do 23).
```json
{ "date": "2026-11-02", "hours": [{ "hour": 9, "tokens": 52000000, "projected": false }] }
```
Za današnji dan su sati koji još nisu prošli `projected: true`, a `tokens` je procena. U mocku se procena pravi na osnovu tipične krive dana.

**`GET /stats/models`**: mapa modela ("Pregled sistema"), mereno na proxyju.
```json
[{ "model": "gpt-4o", "name": "GPT-4o", "provider": "OpenAI", "family": "GPT", "contextWindow": "128k",
   "offPeak": { "latencyMs": 380, "loadPct": 41, "throughputPerMin": 18000 },
   "peak":    { "latencyMs": 640, "loadPct": 86, "throughputPerMin": 42000 } }]
```
- `offPeak` je prozor 02–06 UTC, a `peak` je 14–18 UTC.
- `latencyMs` je p50, a `loadPct` je udeo iskorišćenog rate limita kod provajdera.
- Frontend sam računa zdravlje modela: **problem** ako je `loadPct ≥ 88` ili `latencyMs ≥ 900`, **opterećen** ako je `loadPct ≥ 80`.

**`GET /stats/optimization?from=&to=`**
```json
{ "score": 88.4, "previousScore": 78.8 }
```
Vidi [pravila obračuna](#pravila-obračuna).

### Budžeti
**`GET /budgets`**: jedan red po timu (za vođu tima samo njegov).
```json
[{ "teamId": "t-eng", "teamName": "Engineering", "limit": 10000, "spent": 344.2,
   "dailyAverage": 289.5, "forecast": 8960.3, "status": "willExceed" }]
```
| Metod | Ruta | Telo | Odgovor |
|---|---|---|---|
| PUT | `/budgets/:teamId` | `{ limit }` (USD) | izmenjen red |
| GET | `/alert-rules` | – | `{ warnAtPct: 80, emailLeadAtWarn: true, emailAdminsAtLimit: true, slackAtLimit: false }` |
| PUT | `/alert-rules` | isti oblik | sačuvana pravila |

Backend šalje email i Slack obaveštenja prema ovim pravilima. Frontend ih samo podešava.

### Replay testovi
**`GET /replays`**
```json
[{ "id": "r1", "teamId": "t-support", "teamName": "Support", "function": "ticket-classification",
   "sampleSize": 200, "baseModel": "gpt-4o", "candidateModel": "gpt-4o-mini", "scoring": "judge_rules",
   "status": "done", "createdAt": "...",
   "judgeScore": 94, "rulesScore": 98, "baseLatencyMs": 640, "candidateLatencyMs": 260,
   "verdict": "switch", "savingsPerMonth": 3950, "savingsPct": 0.94 }]
```
- `status` je `"running"` ili `"done"`. Dok test traje, polja sa rezultatima su `null`, a frontend osvežava listu na svake 3 s.
- `verdict` je `"switch"`, `"check"` ili `"dont"`.

**`POST /replays`**: telo je `{ teamId, function, sampleSize (20–1000), candidateModel, scoring: "judge_rules" | "rules" }`, a odgovor `201` sa novim testom (`status: "running"`). `baseModel` backend određuje sam: to je model koji ta funkcija trenutno najviše koristi.

### Uvidi i automatizacija
| Metod | Ruta | Odgovor |
|---|---|---|
| GET | `/insights/anomalies` | Vidi primer ispod. |
| GET | `/insights/cache` | `{ repeatShare: 0.18, estMonthlySavings: 1405, largestSource: { teamName, function } }` |
| GET | `/insights/forecast` | `{ month: "2026-11", projected: 23419, budget: 26450 }` (zbir za timove koje korisnik vidi) |
| GET | `/routing-rules` | `[{ id, replayId, teamId, teamName, function, fromModel, toModel, minJudgeScore: 90, enabled }]` |
| PUT | `/routing-rules/:id` | Telo je `{ enabled }`, a odgovor `{ id, enabled }`. |
| GET | `/settings/privacy` | `{ maskPii: true, maskedLast7Days: 412 }` |
| PUT | `/settings/privacy` | Telo je `{ maskPii }`, a odgovor ista struktura. |

Primer odgovora za `/insights/anomalies`:
```json
[
  { "id": "...", "type": "spike", "teamId": "t-mkt", "teamName": "Marketing", "function": "client-campaigns",
    "client": "acme", "date": "2026-10-30", "factor": 3.4, "detectedAt": "..." },
  { "id": "...", "type": "retry", "teamId": "t-support", "teamName": "Support", "function": "ticket-classification",
    "client": null, "failedRetries": 1240, "hours": 2, "detectedAt": "..." }
]
```
Routing pravilo nastaje automatski kada replay test dobije verdikt `switch` (početno `enabled: false`). Kada je uključeno, proxy šalje pozive te funkcije na `toModel`.

### Izveštaji i uvoz
| Metod | Ruta | Telo | Odgovor |
|---|---|---|---|
| GET | `/reports/status` | – | `{ lastImportAt, lastExportAt }` (`null` ako ih nije bilo) |
| POST | `/reports/exports` | `{ format: "csv" \| "pdf" }` | Beleži da je bilo izvoza. Sam fajl pravi frontend. |
| POST | `/usage/import` | `{ rows: [...] }` | `201 { imported, skipped, errors: [{ row, message }] }` |

Red za uvoz (frontend ga pravi iz CSV-a):
```json
{ "date": "2026-10-30", "team": "support", "function": "faq-answers", "client": "", "model": "gpt-4o-mini",
  "inputTokens": "1000000", "outputTokens": "200000", "cost": "", "requests": "" }
```
- `team` je slug ili naziv tima, a `model` je id ili naziv modela.
- Brojevi stižu kao stringovi iz CSV-a.
- Prazan `cost` znači da backend trošak računa iz cena.

CSV kolone: `date, team, function, client, model, input_tokens, output_tokens, cost, requests`. Obavezne su `date`, `team`, `function`, `model`, `input_tokens` i `output_tokens`.

### Timovi i korisnici (admin)
| Metod | Ruta | Telo | Odgovor |
|---|---|---|---|
| GET | `/teams` | – | lista `Team` (vođa tima dobija samo svoj) |
| POST | `/teams` | `{ name }` | `201 Team`, a `slug` pravi backend. `409` ako postoji. |
| GET | `/users` | – | lista `User` |
| POST | `/users` | `{ name, email, role, teamId }` | `201 User`. Backend šalje pozivnicu na email. |
| PUT | `/users/:id` | podskup `{ name, role, teamId }` | izmenjen `User` |
| DELETE | `/users/:id` | – | `204` (ne može obrisati sebe) |

### Modeli i cene
| Metod | Ruta | Telo | Odgovor |
|---|---|---|---|
| GET | `/models` | – | lista `Model` |
| PUT | `/models/:id` | `{ inputPricePer1M, outputPricePer1M }` | izmenjen `Model` |

---

## Pravila obračuna

Ovo su pravila iz dizajna (i iz mocka). Backend treba da ih primeni isto, da brojevi na ekranu imaju smisla.

| Šta | Pravilo |
|---|---|
| **Verdikt replay testa** | `switch` ako je sudija ≥ 90 i pravila ≥ 95; `check` ako je sudija ≥ 80; inače `dont` |
| **Ušteda testa** | (trošak funkcije na `baseModel` u poslednjih 30 dana) − (isti tokeni po cenama `candidateModel`). Za `dont` je 0. `savingsPct` je ušteda / trenutni trošak. |
| **Moguća mesečna ušteda** (Pregled) | zbir `savingsPerMonth` testova sa verdiktom `switch` ili `check` |
| **Budžet: `spent`** | trošak od 1. u tekućem mesecu do sada |
| **Budžet: `dailyAverage`** | prosek poslednjih 7 punih dana (bez današnjeg) |
| **Budžet: `forecast`** | `spent + dailyAverage × preostali dani u mesecu` |
| **Budžet: `status`** | `over` ako je spent ≥ limit; `almost` ako je spent ≥ limit × warnAtPct; `willExceed` ako je forecast ≥ limit; inače `ok`. Bez limita je `none`. |
| **Ocena optimizacije** | udeo zahteva koji **nisu** na funkciji gde postoji test sa verdiktom `switch`/`check` a routing pravilo nije uključeno (0–100) |
| **Anomalija "spike"** | dnevni trošak funkcije > 2.5 × proseka prethodnih 7 dana |

---

## Prioriteti

Predlog redosleda za backend. Frontend radi sa mockom za sve, pa redosled ne blokira nas.

1. **MVP (README):** `/auth/login`, `/auth/me`, `/stats/summary`, `/stats/timeseries`, `/stats/breakdown`, `/budgets`, `/teams`, `/users`, `/models`, `/currencies`, `/usage/import`
2. **Proxy:** `/org`, `/providers`, `/proxy/status`, `/stats/hourly`, `/stats/models`
3. **Uštede:** `/replays`, `/routing-rules`, `/stats/optimization`, `/insights/*`
4. **Ostalo:** `/auth/signup`, `/auth/google`, `/auth/forgot-password`, `/settings/privacy`, `/alert-rules`, `/reports/*`

Dok neki endpoint ne postoji, **samo kartica koja ga koristi** prikaže grešku sa dugmetom "Pokušaj ponovo". Izuzetak je Pregled, koji učitava sve odjednom i zato traži grupe 1–3.

---

## Kako povezati pravi backend

1. Pokrenuti backend, npr. na `http://localhost:8000`.
2. U `frontend/js/config.js` postaviti:
   ```js
   API_BASE_URL: "http://localhost:8000/api",
   USE_MOCK: false,
   ```
3. Omogućiti CORS za adresu frontenda, ili da backend servira `frontend/` folder kao statičke fajlove.
4. Otvoriti `login.html` i prijaviti se pravim nalogom.

---

## Otvorena pitanja

1. **Proxy.** Ceo dizajn pretpostavlja da AI pozivi idu kroz naš proxy (oznake `X-TL-*`, latencija, replay). Da li backend tim to pravi, ili za MVP ostajemo na uvozu CSV-a?
2. **Replay i sudija.** Koji model ocenjuje kvalitet ("judge"), i koja su "pravila"?
3. **Kursna lista** za EUR i RSD: odakle backend uzima kurs (npr. NBS)?
4. **Više organizacija.** `signup` pravi novu firmu. Da li korisnik može biti u više firmi?
5. **Pozivnice.** Kako izgleda tok kada pozvani korisnik prvi put postavlja lozinku?
6. **Anomalija "retry loop".** Proxy mora da beleži neuspele pozive. Da li je to u planu?
7. **Izvor potrošnje (`source`).** Kolona `source` (`proxy` | `import`) postoji u bazi, ali je nijedan endpoint ne vraća, pa Pregled ne može da razlikuje proxy pozive od CSV uvoza. Predlog: `GET /stats/breakdown?by=source` koji vraća `[{ key: "proxy" | "import", label, cost, tokens, requests }]`, isto kao ostale vrednosti `by`.
