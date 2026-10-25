# Pravila rada u timu

Kratka pravila da svi radimo isto i da kod ostane uredan.

## 1. Osnovno pravilo

**Niko ne pushuje direktno na `main`.** Sve ide kroz Pull Request (PR) i neko drugi iz tima ga pregleda.

## 2. Grane (branches)

Svaki zadatak dobija svoju granu iz `main`. Ime grane: `tip/ime-kratak-opis`

| Tip | Kada |
|-----|------|
| `feature/` | nova funkcionalnost |
| `fix/` | ispravka greške |
| `docs/` | dokumentacija |
| `chore/` | podešavanja, zavisnosti |

Primeri:
- `feature/vojin-dashboard-api`
- `fix/ime-greska-u-formi`
- `docs/vojin-arhitektura`

## 3. Commit poruke

Format: `tip: kratak opis` (na jednom jeziku, dogovorimo se: **srpski ili engleski**, ali dosledno)

```
feat: dodat endpoint za unos potrošnje tokena
fix: ispravljen obračun ukupne cene
docs: ažuriran README
chore: dodata zavisnost za validaciju
```

## 4. Radni tok

```bash
git checkout main
git pull
git checkout -b feature/ime-opis
# ... rad ...
git add .
git commit -m "feat: opis"
git push -u origin feature/ime-opis
```

Zatim na GitHubu otvori **Pull Request** ka `main`.

## 5. Pull Request

- Popuni šablon (šta je urađeno, kako testirati).
- Poveži issue: `Closes #12`.
- Traži pregled od bar jedne osobe.
- Merge tek posle odobrenja.
- Nakon merge-a obriši granu.

## 6. Zadaci

Svi zadaci se vode kao **Issues** na GitHub Project tabli i dodeljeni su konkretnoj osobi.

## 7. Bezbednost

- Nikada ne commit-uj lozinke, API ključeve ili `.env` fajlove (repo je javan!).
- Koristi `.env.example` za prikaz potrebnih promenljivih bez pravih vrednosti.
- Ako slučajno commit-uješ tajni ključ, odmah ga **promeni/opozovi** i javi timu (brisanje commita nije dovoljno).
