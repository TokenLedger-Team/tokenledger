// Animirani teserakt na stranici za prijavu (preuzeto iz docs/design/login/login.js).
// Pauza/pokretanje dugmeta prevodi js/pages/login.js.

/* ===== Tesseract: 16 vertices, 32 edges, rotated in 4D, projected 4D -> 3D -> 2D ===== */
export function startTesseract(onToggle) {
  const cv = document.getElementById("tesseract");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const speed = reduce ? 0.25 : 1; // reduced motion: slower, never frozen
  let paused = false, clock = 0, last = null;

  const V = [];
  for (let i = 0; i < 16; i++) V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  const E = []; // [a, b, connectsTheTwoCubes]
  for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) E.push([i, j, b === 3]); }

  let W = 0, H = 0;
  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function rot(p, i, j, a) {
    const c = Math.cos(a), s = Math.sin(a), x = p[i], y = p[j];
    p[i] = x * c - y * s; p[j] = x * s + y * c;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  // far = neutral (muted ink), near = orange accent; depth also fades the alpha
  const isDark = () => document.documentElement.dataset.theme === "dark";
  const tint = u => {
    const f = isDark() ? [118, 130, 156] : [150, 150, 140], n = isDark() ? [255, 130, 58] : [226, 96, 24];
    const s = Math.min(1, Math.max(0, (u - 0.15) / 0.7)), w = s * s * (3 - 2 * s);
    return [0, 1, 2].map(i => Math.round(lerp(f[i], n[i], w))).join(",");
  };

  function draw(t) {
    const a = t * 0.00035, k = Math.min(W, H) * 0.15;
    const P = V.map(v => {
      const p = v.slice();
      rot(p, 0, 3, a); rot(p, 1, 3, a * 0.7); rot(p, 2, 3, a * 0.5); // the "4D" rotations
      rot(p, 0, 1, a * 0.4); rot(p, 1, 2, a * 0.3);
      const s4 = 4.2 / (4.2 - p[3]);
      const q2 = p[2] * s4, s3 = 6 / (6 - q2);
      return { x: W * (W > 900 ? 0.7 : 0.5) + p[0] * s4 * s3 * k, y: H / 2 + p[1] * s4 * s3 * k, u: Math.min(1, Math.max(0, (p[3] + 1.6) / 3.2)) };
    });
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round";
    E.forEach(([i, j, link]) => {
      const A = P[i], B = P[j], u = (A.u + B.u) / 2, c = tint(u);
      ctx.strokeStyle = `rgba(${c},${(link ? 0.22 : 0.34) + u * 0.62})`;
      ctx.lineWidth = (link ? 1 : 1.8) + u * 1.4;
      ctx.shadowColor = `rgba(${c},.7)`; ctx.shadowBlur = (link ? 6 : 14) * (isDark() ? 1 : 0.3);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    });
    ctx.shadowBlur = 0;
    P.forEach(p => { ctx.fillStyle = `rgba(${tint(p.u)},${0.45 + p.u * 0.55})`; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5 + p.u * 2.5, 0, 6.2832); ctx.fill(); });
  }

  size();
  addEventListener("resize", size);
  const btn = document.getElementById("motionToggle");
  if (btn) btn.addEventListener("click", () => {
    paused = !paused;
    onToggle?.(paused);
    btn.setAttribute("aria-pressed", String(paused));
  });
  requestAnimationFrame(function loop(t) {
    if (last === null) last = t;
    if (!paused) clock += (t - last) * speed;
    last = t;
    draw(clock);
    requestAnimationFrame(loop);
  });
}
