// Poruke o greškama na jeziku iz Accept-Language zaglavlja (sr je podrazumevan).
const MSG = {
  sr: {
    login: "Pogrešan email ili lozinka.",
    session: "Sesija je istekla, prijavi se ponovo.",
    forbidden: "Tvoja uloga nema pravo na ovu akciju.",
    range: "Parametri from i to su obavezni (YYYY-MM-DD).",
    notFound: "Ne postoji.",
    exists: "Već postoji.",
    invalid: "Neispravni podaci.",
    server: "Greška na serveru.",
    google: "Google prijava nije podešena na ovom serveru.",
  },
  en: {
    login: "Wrong email or password.",
    session: "Your session expired, please log in again.",
    forbidden: "Your role is not allowed to do this.",
    range: "Parameters from and to are required (YYYY-MM-DD).",
    notFound: "Not found.",
    exists: "Already exists.",
    invalid: "Invalid data.",
    server: "Server error.",
    google: "Google sign-in is not configured on this server.",
  },
};

export const langOf = (req) => (/^\s*en/i.test(req.get("accept-language") || "") ? "en" : "sr");
export const messages = (lang) => MSG[lang] || MSG.sr;

/** Greška koja se vraća klijentu kao { message } sa datim statusom. `key` je ključ iz MSG. */
export class HttpError extends Error {
  constructor(status, key) {
    super(key);
    this.status = status;
    this.key = key;
  }
}
