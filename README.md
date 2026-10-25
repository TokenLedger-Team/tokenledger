# TokenLedger

**Pratite koliko vaša firma troši na AI agente i LLM-ove, na jednom mestu.**

TokenLedger je web aplikacija koja omogućava firmama (malim i velikim) da prate potrošnju tokena i troškove AI alata i LLM servisa koje plaćaju zaposlenima ili koriste kao firma. Podaci o potrošnji prikazuju se na preglednom dashboardu, po timovima, korisnicima, modelima i vremenskim periodima.

> Projekat za takmičenje **InnovNation**.

---

## Problem

Firme sve više plaćaju AI alate (ChatGPT, Claude, Copilot, API pristupe i dr.), ali nemaju jasan uvid u to:
- koliko ukupno troše,
- ko i na šta troši najviše,
- kada će prekoračiti budžet.

## Rešenje

TokenLedger objedinjuje potrošnju tokena iz više izvora u jedan sistem i prikazuje je kroz dashboard sa grafikonima, limitima i upozorenjima.

## Glavne funkcionalnosti

- [ ] Dodavanje i evidencija tokena / potrošnje (ručno i preko API-ja)
- [ ] Dashboard sa ukupnom potrošnjom i trendovima
- [ ] Pregled po zaposlenom, timu, modelu i periodu
- [ ] Budžeti i upozorenja pri prekoračenju
- [ ] Upravljanje korisnicima i ulogama (admin / menadžer / zaposleni)
- [ ] Izvoz izveštaja (CSV / PDF)

*(Označavamo kvačicom kako funkcionalnosti budu gotove.)*

## Tehnologije

| Sloj | Tehnologija |
|------|-------------|
| Frontend | _TBD_ |
| Backend | _TBD_ |
| Baza podataka | _TBD_ |
| Deploy | _TBD_ |

## Struktura repozitorijuma

```
tokenledger/
├── frontend/   # korisnički interfejs i dashboard
├── backend/    # API, poslovna logika, baza
├── docs/       # dokumentacija, dijagrami, koncept
└── .github/    # šabloni za Pull Request i Issues
```

## Pokretanje projekta

> Uputstvo će biti dopunjeno kad se izaberu tehnologije.

```bash
git clone https://github.com/TokenLedger-Team/tokenledger.git
cd tokenledger
```

Backend: _uskoro_
Frontend: _uskoro_

Kopiraj `.env.example` u `.env` i popuni vrednosti. **Nikada ne commit-uj `.env`.**

## Tim

| Ime | Uloga |
|-----|-------|
| Vojin Sundović | Vođa tima, backend, koncept i dokumentacija |
| _ime_ | Backend |
| _ime_ | Frontend |
| _ime_ | Frontend |

## Kako doprineti

Pročitaj [CONTRIBUTING.md](CONTRIBUTING.md) pre prvog Pull Requesta.

## Licenca

[MIT](LICENSE)
