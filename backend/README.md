# Backend

Serverski deo aplikacije **TokenLedger**: REST API, obračun troškova i baza za evidenciju potrošnje AI tokena po timovima. Ugovor sa frontendom je [frontend/API.md](../frontend/API.md); kad se ne slaže sa mockom (`frontend/js/mock/server.js`), backend prati mock.

## Tehnologije

Node.js 20+, Express, SQLite (`better-sqlite3`, čist SQL), `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`, `swagger-ui-express`.

## Instalacija i pokretanje

```bash
cd backend
npm install
cp .env.example .env      # pa popuni JWT_SECRET
npm run dev               # node --watch; ili: npm start (prvi start pravi praznu bazu)
```

Frontend (drugi terminal): `cd frontend && python3 -m http.server 5500`, pa http://localhost:5500/login.html. U `frontend/js/config.js` mora biti `USE_MOCK: false`.

API je na `http://localhost:8000/api`, dokumentacija na **http://localhost:8000/api/docs**.

## Promenljive okruženja (`.env`)

| Promenljiva | Opis |
|---|---|
| `PORT` | Port servera (8000) |
| `JWT_SECRET` | **Obavezno**, min. 16 znakova. Generiši: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGIN` | Dozvoljeni origin(i) frontenda, odvojeni zarezom (`http://localhost:5500`) |
| `DB_PATH` | Putanja do SQLite fajla; prazno = `backend/data/tokenledger.db` |
| `KEY_ENCRYPTION_SECRET` | Tajna za šifrovanje provajder ključeva; prazno = koristi se `JWT_SECRET` |
| `PROXY_URL` | Adresa proxyja koja se prikazuje u uputstvu za povezivanje (`/org`) |
| `SEED_PASSWORD` | Lozinka demo naloga (podrazumevano `demo`) |

`.env` i `backend/data/` se ne commit-uju.

## Prazna baza, registracija i demo podaci

Pri prvom startu backend pravi **praznu bazu**. Prvi nalog se pravi registracijom na `login.html` ("Registruj se"): to pravi novu organizaciju sa katalogom modela i cena, a korisnik postaje `admin`. Svaka organizacija vidi samo svoje podatke i ima svoje cene.

Tipičan tok za demo:
1. Registracija (ime, firma, email, lozinka min. 8 znakova).
2. **Podešavanje**: dodaj timove, pa korisnike (admin zadaje početnu lozinku, nema emaila) i ključeve provajdera.
3. **Budžeti**: postavi limite po timu.
4. **Izveštaji → Uvoz**: otpremi CSV sa potrošnjom. Primer: `npm run sample-csv -- support marketing` pravi `backend/data/primer-potrosnje.csv` za poslednjih 14 dana (timovi sa tim slugovima moraju već postojati).
5. Pregled, Replay i Uvidi se pune iz uvezenih podataka.

| Komanda | Šta radi |
|---|---|
| `npm run reset` | Briše bazu (zaustavi server pre toga); sledeći start pravi praznu |
| `npm run seed` | **Briše sve** i puni demo podacima kao mock (180 dana unazad od danas, Acme Corp) |
| `npm run sample-csv -- <slug>...` | Pravi primer CSV-a za uvoz |

Demo nalozi posle `npm run seed` (lozinka `demo`): `admin@firma.rs`, `lead@firma.rs` (tim Support), `observer@firma.rs`.

## Napomene o ponašanju

- Trošak se računa pri svakom upitu iz tabele cena (`models`), pa izmena cene preračunava istoriju. Uvezeni redovi mogu imati svoj `cost`.
- Prava se proveravaju na svakoj ruti; `lead` svuda vidi samo svoj tim. Uloga se čita iz baze pri svakom zahtevu, pa promena važi odmah.
- `POST /auth/logout` poništava token (tabela `revoked_tokens`).
- Provajder ključevi se čuvaju AES-256-GCM šifrovani; API vraća samo `last4`.
- `POST /users` prima i `password` (min. 8); bez nje korisnik ne može da se prijavi. Pozivnice emailom nisu urađene.
- `POST /auth/forgot-password` uvek vraća `{ ok: true }`, ali email se ne šalje; zaboravljenu lozinku za sada ne može da vrati nijedna ruta. `GET /auth/google` vraća 501 (nije podešeno).
- `/proxy/status`: proxy još ne postoji, pa je `healthy` uvek `true`, a `lastCallAt` je poslednji zapis sa izvorom `proxy`.
- Kursevi u `/currencies` su konstante (otvoreno pitanje u API.md).

## Urađeni endpointi

Grupa 1 (MVP): `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /stats/summary`, `GET /stats/timeseries`, `GET /stats/breakdown`, `GET /budgets`, `PUT /budgets/:teamId`, `GET/POST /teams`, `GET/POST /users`, `PUT/DELETE /users/:id`, `GET /models`, `PUT /models/:id`, `GET /currencies`, `POST /usage/import`.

Grupa 2 (proxy): `GET /org`, `GET /providers`, `POST /providers/:id/keys`, `DELETE /providers/:id/keys/:keyId`, `GET /proxy/status`, `GET /stats/hourly`, `GET /stats/models`.

Grupa 3: `GET/POST /replays`, `GET /stats/optimization`, `GET /insights/anomalies`, `GET /insights/cache`, `GET /insights/forecast`, `GET /routing-rules`, `PUT /routing-rules/:id`.

Grupa 4: `POST /auth/signup`, `POST /auth/forgot-password`, `GET /auth/google` (501), `GET/PUT /settings/privacy`, `GET /reports/status`, `POST /reports/exports`.

Dodatno: `GET/PUT /alert-rules` (potrebno stranici Budžeti; `warnAtPct` utiče i na status budžeta).

**Nije urađeno:** slanje emailova (pozivnice, reset lozinke), Google prijava, proxy koji sam beleži potrošnju (potrošnja se unosi CSV uvozom).

## Replay testovi i dok nema proxyja

- `POST /replays` pravi test sa `status: "running"`; kad prođe ~6 s, prvi sledeći upit ga završava (nema pozadinskog posla). Pravi "sudija" ne postoji: ocene su pseudo-slučajne ali stabilne za isti par funkcija/kandidat (isto kao mock). Test sa verdiktom `switch` pravi routing pravilo (isključeno).
- Verdikt, ušteda, ocena optimizacije i spike anomalija računaju se po pravilima iz API.md. `previousScore` u `/stats/optimization` je procena (`score − 9.6`) jer istorija pravila ne postoji.
- Podaci koje bi merio proxy čuvaju se kao brojači koje seed postavlja: `repeatShare` i najveći izvor ponavljanja (`/insights/cache`), `maskedLast7Days` (`/settings/privacy`) i neuspeli pozivi u petlji (anomalija `retry`, tabela `retry_events`). `largestSource` se vođi tima vraća samo ako je izvor u njegovom timu, inače `null`.

## Pravila

Rad na granama i Pull Requestima prema [CONTRIBUTING.md](../CONTRIBUTING.md).

## Odgovorni

Vojin Šundović i Petar Trajković.
