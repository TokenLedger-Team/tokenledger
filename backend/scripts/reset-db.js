// Briše bazu (sve podatke). Zaustavi server pre pokretanja. Nova prazna baza se pravi pri sledećem startu.
import fs from "node:fs";
import { config } from "../src/config.js";

for (const f of [config.dbPath, `${config.dbPath}-wal`, `${config.dbPath}-shm`]) fs.rmSync(f, { force: true });
console.log(`Obrisano: ${config.dbPath}`);
