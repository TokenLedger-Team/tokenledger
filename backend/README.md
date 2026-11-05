# Backend

Serverski deo aplikacije **TokenLedger**: REST API, obračun troškova i baza za evidenciju potrošnje AI tokena po timovima. Ugovor sa frontendom je [frontend/API.md](../frontend/API.md); kad se ne slaže sa mockom (`frontend/js/mock/server.js`), backend prati mock.

## Tehnologije

Node.js 20+, Express, SQLite (`better-sqlite3`, čist SQL), `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`, `swagger-ui-express`.

## Instalacija i pokretanje

```bash
cd backend
npm install
cp .env.example .env      # pa popuni JWT_SECRET
npm run seed              # pravi backend/data/tokenledger.db sa demo podacima
npm run dev               # node --watch; ili: npm start
```

API je na `http://localhost:8000/api`, dokumentacija na **http://localhost:8000/api/docs**.

## Promenljive okruženja (`.env`)

| Promenljiva | Opis |
|---|---|
| `PORT` | Port servera (8000) |
| `JWT_SECRET` | **Obavezno**, min. 16 znakova. Generiši: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGIN` | Dozvoljeni origin(i) frontenda, odvojeni zarezom (`http://localhost:5500`) |
| `DB_PATH` | Putanja do SQLite fajla; prazno = `backend/data/tokenledger.db` |
| `KEY_ENCRYPTION_SECRET` | Tajna za šifrovanje provajder ključeva; prazno = koristi se `JWT_SECRET` |
| `SEED_PASSWORD` | Lozinka demo naloga (podrazumevano `demo`) |

`.env` i `backend/data/` se ne commit-uju.

## Seed i demo nalozi

`npm run seed` **briše sve podatke** i puni bazu istim podacima kao mock (13 tokova potrošnje, 180 dana unazad od danas, deterministički). Pošto su datumi relativni na dan pokretanja, seed ponovi kad podaci ostare.

Nalozi (lozinka `demo`): `admin@firma.rs`, `lead@firma.rs` (tim Support), `observer@firma.rs`.

## Napomene o ponašanju

- Trošak se računa pri svakom upitu iz tabele cena (`models`), pa izmena cene preračunava istoriju. Uvezeni redovi mogu imati svoj `cost`.
- Prava se proveravaju na svakoj ruti; `lead` svuda vidi samo svoj tim. Uloga se čita iz baze pri svakom zahtevu, pa promena važi odmah.
- `POST /auth/logout` poništava token (tabela `revoked_tokens`).
- Provajder ključevi se čuvaju AES-256-GCM šifrovani; API vraća samo `last4`.
- `POST /users` pravi korisnika bez lozinke (ne može da se prijavi); pozivnice emailom nisu urađene.
- `/proxy/status`: proxy još ne postoji, pa je `healthy` uvek `true`, a `lastCallAt` je poslednji zapis sa izvorom `proxy`.
- Kursevi u `/currencies` su konstante (otvoreno pitanje u API.md).

## Urađeni endpointi

Grupa 1 (MVP): `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /stats/summary`, `GET /stats/timeseries`, `GET /stats/breakdown`, `GET /budgets`, `PUT /budgets/:teamId`, `GET/POST /teams`, `GET/POST /users`, `PUT/DELETE /users/:id`, `GET /models`, `PUT /models/:id`, `GET /currencies`, `POST /usage/import`.

Grupa 2 (proxy): `GET /org`, `GET /providers`, `POST /providers/:id/keys`, `DELETE /providers/:id/keys/:keyId`, `GET /proxy/status`, `GET /stats/hourly`, `GET /stats/models`.

Grupa 3: `GET/POST /replays`, `GET /stats/optimization`, `GET /insights/anomalies`, `GET /insights/cache`, `GET /insights/forecast`, `GET /routing-rules`, `PUT /routing-rules/:id`.

Grupa 4 (delimično): `GET/PUT /settings/privacy`, `GET /reports/status`, `POST /reports/exports`.

Dodatno: `GET/PUT /alert-rules` (potrebno stranici Budžeti; `warnAtPct` utiče i na status budžeta).

**Nije urađeno:** `/auth/signup`, `/auth/google`, `/auth/forgot-password`.

## Replay testovi i dok nema proxyja

- `POST /replays` pravi test sa `status: "running"`; kad prođe ~6 s, prvi sledeći upit ga završava (nema pozadinskog posla). Pravi "sudija" ne postoji: ocene su pseudo-slučajne ali stabilne za isti par funkcija/kandidat (isto kao mock). Test sa verdiktom `switch` pravi routing pravilo (isključeno).
- Verdikt, ušteda, ocena optimizacije i spike anomalija računaju se po pravilima iz API.md. `previousScore` u `/stats/optimization` je procena (`score − 9.6`) jer istorija pravila ne postoji.
- Podaci koje bi merio proxy čuvaju se kao brojači koje seed postavlja: `repeatShare` i najveći izvor ponavljanja (`/insights/cache`), `maskedLast7Days` (`/settings/privacy`) i neuspeli pozivi u petlji (anomalija `retry`, tabela `retry_events`). `largestSource` se vođi tima vraća samo ako je izvor u njegovom timu, inače `null`.

## Pravila

Rad na granama i Pull Requestima prema [CONTRIBUTING.md](../CONTRIBUTING.md).

## Odgovorni

Vojin Šundović i Petar Trajković.
