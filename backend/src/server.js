import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { config, requireSecrets } from "./config.js";
import { HttpError, langOf, messages } from "./i18n.js";
import { authenticate } from "./auth.js";
import { openapi } from "./openapi.js";
import { privateAuth, publicAuth } from "./routes/auth.js";
import * as org from "./routes/org.js";
import * as stats from "./routes/stats.js";
import * as budgets from "./routes/budgets.js";
import * as teams from "./routes/teams.js";
import * as users from "./routes/users.js";
import * as models from "./routes/models.js";
import * as usage from "./routes/usage.js";
import * as savings from "./routes/savings.js";

requireSecrets();

const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: config.corsOrigins,
    allowedHeaders: ["Authorization", "Content-Type", "Accept-Language"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use(express.json({ limit: "5mb" }));
app.use((req, _res, next) => {
  req.lang = langOf(req);
  next();
});

const api = express.Router();
api.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
api.get("/openapi.json", (_req, res) => res.json(openapi));
api.get("/health", (_req, res) => res.json({ ok: true }));

api.use("/auth", publicAuth, privateAuth);
// Sve ispod traži prijavljenog korisnika; prava po ulozi proverava svaka ruta.
api.use(authenticate);
for (const m of [org, stats, budgets, teams, users, models, usage, savings]) api.use(m.router);
app.use("/api", api);

app.use((_req, _res, next) => next(new HttpError(404, "notFound")));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const m = messages(req.lang);
  if (err instanceof HttpError) return res.status(err.status).json({ message: m[err.key] || err.key });
  if (err.type === "entity.parse.failed" || err.status === 400) return res.status(400).json({ message: m.invalid });
  if (err.type === "entity.too.large") return res.status(413).json({ message: m.invalid });
  console.error(err);
  res.status(500).json({ message: m.server });
});

app.listen(config.port, () => console.log(`TokenLedger API: http://localhost:${config.port}/api  (docs: /api/docs)`));
