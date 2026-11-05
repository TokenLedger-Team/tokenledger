import { addDays, round2, todayISO } from "../util.js";
import { summary } from "./stats.js";

// Udeo dnevnih tokena po satu (0-23), tipičan radni dan (isto kao u mocku).
export const HOUR_CURVE = [
  0.4, 0.3, 0.25, 0.25, 0.3, 0.5, 1.2, 2.6, 4.8, 6.9, 8.6, 8.1, 6.4, 7.2, 7.9, 7.1, 6.0, 4.6, 3.2, 2.4, 1.8, 1.3, 0.9, 0.6,
];

/**
 * 24 reda po satu. Dnevni zbir se raspoređuje po tipičnoj krivi dana; za današnji dan se
 * dnevni zbir procenjuje iz sati koji su prošli, a ostali sati su projected.
 */
export function hourly(user, date) {
  const isToday = date === todayISO();
  const nowHour = new Date().getHours();
  const sum = (d) => summary(user, d, d).totalTokens;
  const curveTotal = HOUR_CURVE.reduce((a, b) => a + b, 0);
  const doneShare = HOUR_CURVE.slice(0, nowHour).reduce((a, b) => a + b, 0) / curveTotal;
  const dayTotal = isToday ? (doneShare ? sum(date) / doneShare : sum(addDays(date, -1))) : sum(date);
  const hours = HOUR_CURVE.map((w, hour) => ({
    hour,
    tokens: Math.round((dayTotal * w) / curveTotal),
    projected: isToday && hour >= nowHour,
  }));
  return { date, hours };
}
