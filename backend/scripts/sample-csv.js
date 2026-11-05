// Pravi primer CSV-a za uvoz (stranica Izveštaji → Uvoz): poslednjih N dana za timove iz argumenata.
// Upotreba: npm run sample-csv -- support marketing   (slug timova; podrazumevano: support)
// Izlaz: backend/data/primer-potrosnje.csv
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "primer-potrosnje.csv");
const teams = process.argv.slice(2).length ? process.argv.slice(2) : ["support"];
const DAYS = 14;
const STREAMS = [
  ["faq-answers", "acme", "gpt-4o-mini", 1_200_000, 250_000, 1500],
  ["ticket-classification", "", "gpt-4o", 900_000, 60_000, 2500],
  ["doc-summarization", "", "claude-sonnet", 800_000, 70_000, 400],
];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const lines = ["date,team,function,client,model,input_tokens,output_tokens,cost,requests"];
for (let i = DAYS - 1; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);
  const k = 0.8 + ((i * 7) % 5) / 10; // blaga dnevna promena
  for (const team of teams) {
    for (const [fn, client, model, inp, outp, req] of STREAMS) {
      lines.push([iso(d), team, fn, client, model, Math.round(inp * k), Math.round(outp * k), "", Math.round(req * k)].join(","));
    }
  }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`Upisano ${lines.length - 1} redova u ${out}\nTimovi (slug): ${teams.join(", ")}. Tim mora da postoji (Podešavanje → Timovi).`);
