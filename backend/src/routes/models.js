import { Router } from "express";
import { db } from "../db.js";
import { HttpError } from "../i18n.js";
import { requireRole } from "../auth.js";
import { modelView } from "../services/catalog.js";

export const router = Router();

router.get("/models", (_req, res) => res.json(db.prepare("SELECT * FROM models ORDER BY rowid").all().map(modelView)));

// Trošak se računa iz cena pri svakom upitu, pa izmena cene automatski preračunava istoriju.
router.put("/models/:id", requireRole("admin"), (req, res) => {
  const model = db.prepare("SELECT * FROM models WHERE id = ?").get(req.params.id);
  if (!model) throw new HttpError(404, "notFound");
  const input = Number(req.body?.inputPricePer1M);
  const output = Number(req.body?.outputPricePer1M);
  if (!(input >= 0) || !(output >= 0) || !Number.isFinite(input) || !Number.isFinite(output)) throw new HttpError(400, "invalid");
  db.prepare("UPDATE models SET input_price_per_1m = ?, output_price_per_1m = ? WHERE id = ?").run(input, output, model.id);
  res.json(modelView(db.prepare("SELECT * FROM models WHERE id = ?").get(model.id)));
});
