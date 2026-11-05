import { Router } from "express";
import { HttpError } from "../i18n.js";
import { addDays, isISODate, todayISO } from "../util.js";
import { breakdown, summary, timeseries } from "../services/stats.js";
import { hourly } from "../services/hourly.js";
import { fleet } from "../services/fleet.js";

export const router = Router();

function range(req) {
  const { from, to } = req.query;
  if (!isISODate(from) || !isISODate(to)) throw new HttpError(400, "range");
  if (from > to || addDays(from, 3660) < to) throw new HttpError(400, "invalid");
  return { from, to };
}

router.get("/stats/summary", (req, res) => {
  const { from, to } = range(req);
  res.json(summary(req.user, from, to));
});

router.get("/stats/timeseries", (req, res) => {
  const { from, to } = range(req);
  res.json(timeseries(req.user, from, to));
});

router.get("/stats/breakdown", (req, res) => {
  const { from, to } = range(req);
  const by = req.query.by;
  if (!["team", "function", "client", "model"].includes(by)) throw new HttpError(400, "invalid");
  res.json(breakdown(req.user, from, to, by));
});

router.get("/stats/hourly", (req, res) => {
  const date = req.query.date || todayISO();
  if (!isISODate(date)) throw new HttpError(400, "invalid");
  res.json(hourly(req.user, date));
});

router.get("/stats/models", (_req, res) => res.json(fleet()));
