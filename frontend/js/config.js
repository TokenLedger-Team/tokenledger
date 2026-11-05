// Podešavanja frontenda. Ovo je JEDINO mesto koje treba menjati
// kada backend bude spreman (vidi frontend/API.md).

export const config = {
  // Adresa backend API-ja (bez "/" na kraju).
  API_BASE_URL: "http://localhost:8000/api",

  // true  = frontend koristi lažni backend iz js/mock/ (pravi server nije potreban)
  // false = svi pozivi idu na API_BASE_URL
  USE_MOCK: false,

  // Podrazumevane vrednosti dok korisnik ne promeni nešto u gornjoj traci.
  DEFAULT_LANG: "sr", // "sr" | "en"
  DEFAULT_CURRENCY: "USD", // "USD" | "EUR" | "RSD" (backend uvek vraća USD)
  DEFAULT_PERIOD_DAYS: 7, // 7 | 30 | 90
};
