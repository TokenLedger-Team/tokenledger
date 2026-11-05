import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  proxy_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,                       -- NULL = pozvan, još nije postavio lozinku
  role          TEXT NOT NULL CHECK (role IN ('admin','lead','observer')),
  team_id       TEXT REFERENCES teams(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id        TEXT PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES organizations(id),
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL,
  functions TEXT NOT NULL DEFAULT '[]',     -- JSON niz
  clients   TEXT NOT NULL DEFAULT '[]',     -- JSON niz
  UNIQUE (org_id, slug)
);

CREATE TABLE IF NOT EXISTS models (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  provider           TEXT NOT NULL,
  family             TEXT NOT NULL,
  input_price_per_1m  REAL NOT NULL,
  output_price_per_1m REAL NOT NULL,
  context_window     TEXT NOT NULL,
  fleet              TEXT                   -- JSON { offPeak:[ms,%,rpm], peak:[ms,%,rpm] }
);

-- hour je NULL za dnevne zbirove (seed, uvoz); proxy može upisivati po satu.
-- cost je NULL kada se trošak računa iz tabele cena.
CREATE TABLE IF NOT EXISTS usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  date          TEXT NOT NULL,
  hour          INTEGER,
  team_id       TEXT NOT NULL REFERENCES teams(id),
  function      TEXT NOT NULL,
  client        TEXT,
  model         TEXT NOT NULL REFERENCES models(id),
  requests      INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost          REAL,
  latency_ms    INTEGER,
  source        TEXT NOT NULL CHECK (source IN ('proxy','import')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_org_date ON usage(org_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_team_date ON usage(team_id, date);

CREATE TABLE IF NOT EXISTS budgets (
  team_id   TEXT PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  limit_usd REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_rules (
  org_id               TEXT PRIMARY KEY REFERENCES organizations(id),
  warn_at_pct          REAL NOT NULL DEFAULT 80,
  email_lead_at_warn   INTEGER NOT NULL DEFAULT 1,
  email_admins_at_limit INTEGER NOT NULL DEFAULT 1,
  slack_at_limit       INTEGER NOT NULL DEFAULT 0
);

-- Ključ se čuva samo šifrovan (AES-256-GCM); last4 je jedino što se vraća klijentu.
CREATE TABLE IF NOT EXISTS provider_keys (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id),
  provider_id   TEXT NOT NULL,
  environment   TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  last4         TEXT NOT NULL,
  UNIQUE (org_id, provider_id, environment)
);

-- Poništeni tokeni (logout).
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
`);

export const tx = (fn) => db.transaction(fn)();
