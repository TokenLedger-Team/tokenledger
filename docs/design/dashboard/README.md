# Token Ledger UI prototype v4 — MVP functionality map

Open `index.html` in a browser. No build step. All data is demo data.

| Module (sidebar) | Features |
|---|---|
| Dashboard | F-06 spend by day, team, function, model, top spenders |
| Budgets | F-07 per-team limits, alerts at 80% / 100% |
| Replay & savings | F-08 replay tests, F-09 judge + rule scoring and savings report, F-10 verdict: Switch / Switch with check / Don't switch |
| Insights & automation | F-11 anomalies, F-12 repeated queries, F-15 forecast, F-16 auto-routing rules, F-17 PII masking |
| Reports & import | F-13 CSV import, F-14 CSV/PDF export, EUR / RSD / USD |
| Setup & access | F-01 roles, F-02 organization and encrypted API keys, F-03 proxy, F-04 call tags |
| Price table | F-05 admin-editable model prices |

Top bar: **Role** (Admin / Team lead / Observer) hides modules and disables edits; **Currency** converts every amount (demo rates).

Files: `features.js` (modules, roles, currency), `models.js` / `models.css` (model map, themes), `login.html` + `login.css` + `login.js` (sign-in).
