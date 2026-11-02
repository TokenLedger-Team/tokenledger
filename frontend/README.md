# Frontend

Korisnički interfejs aplikacije **TokenLedger**, napravljen prema dizajnu iz [`docs/design/`](../docs/design/).

## Tehnologije

- **Čist HTML, CSS i JavaScript** (ES moduli), bez frameworka i bez build koraka. Backend timu ne treba Node ni npm.
- Grafikoni su SVG koji crtamo sami (`js/charts.js`), bez spoljnih biblioteka.
- Fontovi DM Sans i Manrope se učitavaju sa Google Fonts.

## Pokretanje

ES moduli ne rade kad se HTML otvori duplim klikom (`file://`), pa je potreban lokalni server:

```bash
cd frontend
python3 -m http.server 5500
```

Zatim otvori <http://localhost:5500/login.html>.

Može i **Live Server** u VS Code-u, ili `npx serve` ako imaš Node.

### Demo nalozi (dok je `USE_MOCK: true`)

Na stranici za prijavu klikni na nalog, a lozinka može biti bilo šta.

| Email | Uloga | Šta vidi |
|---|---|---|
| `admin@firma.rs` | Administrator | svih 7 modula |
| `lead@firma.rs` | Vođa tima (Support) | 5 modula, samo podatke svog tima |
| `observer@firma.rs` | Posmatrač | 3 modula, ne može ništa da menja |

Izmene u demou (limiti, cene, korisnici...) pamte se u browseru. Za početno stanje u konzoli pokreni:

```js
(await import("./js/mock/server.js")).resetMock()
```

pa osveži stranicu.

## Stranice

| Fajl | Modul | Uloge |
|---|---|---|
| `login.html` | Prijava i registracija (Google, zaboravljena lozinka) | svi |
| `index.html` | Pregled: troškovi, modeli, potrošnja po satu, optimizacija, budžet, raspodela, mapa modela, preporuke | svi |
| `budgets.html` | Budžeti timova, pravila za upozorenja, limiti | svi |
| `replay.html` | Replay testovi, verdikti, izveštaj o uštedi, novi test | svi |
| `insights.html` | Anomalije, keš, prognoza, auto-routing, maskiranje | admin, lead |
| `reports.html` | Uvoz CSV-a, izvoz CSV/PDF | admin, lead |
| `setup.html` | Ključevi provajdera, timovi, povezivanje aplikacije, korisnici i uloge | admin |
| `prices.html` | Tabela cena modela | admin |

Gornja traka na svakoj stranici ima **jezik (SR/EN)**, **valutu (USD/EUR/RSD)**, **temu (svetla/tamna)** i **period (7/30/90 dana)**. Izbor se pamti u browseru.

## Struktura

```
frontend/
├── *.html                 # po jedna stranica; sve dele isti okvir
├── API.md                 # ⭐ dogovor sa backendom: endpointi, podaci, pravila obračuna
├── css/
│   ├── app.css            # stilovi aplikacije, svetla i tamna tema
│   └── login.css          # stranica za prijavu
└── js/
    ├── config.js          # ⭐ API_BASE_URL i USE_MOCK (jedino mesto za povezivanje)
    ├── api.js             # svi pozivi ka backendu (jedna funkcija = jedan endpoint)
    ├── auth.js            # sesija, uloge i prava
    ├── i18n.js            # svi tekstovi na srpskom i engleskom
    ├── settings.js        # jezik, valuta, period, tema
    ├── format.js          # novac, brojevi, datumi, poruke
    ├── layout.js          # meni, gornja traka, učitavanje stranice
    ├── charts.js          # SVG grafikoni
    ├── ui.js              # mali HTML blokovi (red tabele, čip, prekidač)
    ├── login-visual.js    # animacija na stranici za prijavu
    ├── pages/             # logika svake stranice
    └── mock/              # lažni backend za razvoj (vidi ispod)
```

## Integracija sa backendom

Sve što backend tim treba da zna je u **[API.md](API.md)**. Ukratko:

1. **Stranice nikad ne pozivaju `fetch` direktno**, nego samo funkcije iz `js/api.js`.
2. **Dok je `USE_MOCK: true`**, te funkcije zove `js/mock/server.js`. To je **lažni backend koji radi u browseru** i vraća iste rute i isti JSON koje će vraćati pravi backend. Nije pravi server i ne ide u produkciju; služi da frontend radi pre backenda i kao primer za backend tim.
3. **Kad backend bude spreman**, u `js/config.js` se postavi `USE_MOCK: false` i `API_BASE_URL`. Ništa drugo se ne menja.
4. **Svi iznosi stižu u USD**, a frontend ih preračunava u izabranu valutu.
5. **U frontendu nema tajnih ključeva.** Sve se izvršava u browseru korisnika.

## Dodavanje teksta ili prevoda

Svi tekstovi su u `js/i18n.js`, kao parovi `["srpski", "engleski"]`. U kodu se koriste preko `t("kljuc")`.

## Odgovorni

_Imena frontend kolega._

## Pravila

Rad na granama i Pull Requestima prema [CONTRIBUTING.md](../CONTRIBUTING.md).
