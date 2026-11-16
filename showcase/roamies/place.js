// Where on the screen the sidekick should be. It reads the layout of the screen (the app windows, front to back, from
// the hands helper on Windows; only their rectangles, never their titles or contents), the cursor, its own bubbles
// and drawings, and scores a few dozen candidate spots. Lower is better. What it weighs:
//
//   cover    how much of what's on screen it would hide. Each window is worth more the nearer the front it is, and
//            more in the middle and top-left (where content is) than along its right and bottom edges. Bare desktop is free.
//   bubble   whether its speech bubble has room beside it, and what the bubble would hide.
//   cursor   not on top of the cursor (but it doesn't run from it, or follow it).
//   avoid    never over its own cards and drawings.
//   target   when it's talking about something on screen: beside it, close, never on it.
//   edges    the whole globe on screen; a slight pull toward the screen's right half and lower corners, out of the way.
//   stay     moving has a cost, so it only moves for a clearly better spot (and doesn't flit between equals).
//
// best() returns the winner and the runners-up; agent.js moves there with a dash or a phase (never a glide).
(() => {
  const R = (window.Roamie ??= {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const inside = (r, x, y) => x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];
  // Sample points of a disc: the centre, and two rings.
  const DISC = [[0, 0], ...[0, 1, 2, 3, 4, 5].map((i) => [Math.cos(i * 1.047) * 0.5, Math.sin(i * 1.047) * 0.5]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [Math.cos(i * 0.785) * 0.92, Math.sin(i * 0.785) * 0.92])];

  // How much it matters to hide the point (x, y): 0 on bare desktop, up to about 1 in the middle of the front window.
  const worth = (x, y, windows) => {
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i], r = w.rect;
      if (!inside(r, x, y)) continue;
      // The topmost window here decides. Front window 1; the ones behind it count for less, never nothing.
      const rank = w.front ? 1 : Math.max(0.3, 0.62 - i * 0.08);
      const u = (x - r[0]) / Math.max(1, r[2]), v = (y - r[1]) / Math.max(1, r[3]);
      // Content sits in the middle and the top-left; the right edge (scroll bars, margins) and the bottom are quieter.
      const mid = 1 - Math.min(1, Math.hypot((u - 0.45) / 0.62, (v - 0.42) / 0.62));
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const quiet = (u > 0.86 ? 0.25 : 0) + (v > 0.84 ? 0.2 : 0) + (edge < 0.04 ? 0.1 : 0);
      return rank * clamp(0.45 + 0.55 * mid - quiet, 0.12, 1);
    }
    return 0;
  };

  const coverOf = (x, y, rad, windows) => {
    let sum = 0;
    for (const [dx, dy] of DISC) sum += worth(x + dx * rad, y + dy * rad, windows);
    return sum / DISC.length;
  };

  // The score of standing at (x, y). ctx: { screen: {l,t,r,b}, windows: [{rect:[x,y,w,h], front}], rad, cursor: [x,y]?,
  // here: [x,y]?, avoid: [[x,y,w,h]], target: [x,y,w,h]?, bubble: [w,h]? }. Returns { score, parts } (parts for tests).
  const score = (x, y, ctx) => {
    const { screen: S, windows = [], rad } = ctx, parts = {};
    // The whole globe on screen, with a little air.
    const pad = rad * 1.12;
    if (x < S.l + pad || x > S.r - pad || y < S.t + pad || y > S.b - pad) return { score: 99, parts: { off: 1 } };
    parts.cover = coverOf(x, y, rad, windows) * 1.5;
    // Its bubble opens beside it, on the side with more room; it shouldn't hide the front window's middle either.
    const [bw, bh] = ctx.bubble ?? [rad * 3.2, rad * 1.5];
    const side = (dir) => {
      const bx = dir > 0 ? x + rad * 1.15 : x - rad * 1.15 - bw, by = y - bh * 0.6;
      const fits = bx >= S.l && bx + bw <= S.r && by >= S.t && by + bh <= S.b;
      let hid = 0;
      for (const [u, v] of [[0.2, 0.3], [0.5, 0.3], [0.8, 0.3], [0.2, 0.7], [0.5, 0.7], [0.8, 0.7]]) hid += worth(bx + bw * u, by + bh * v, windows);
      return (fits ? 0 : 0.55) + (hid / 6) * 0.45;
    };
    parts.bubble = Math.min(side(1), side(-1));
    if (ctx.cursor) { const d = Math.hypot(x - ctx.cursor[0], y - ctx.cursor[1]); parts.cursor = d < rad * 1.4 ? 0.9 : d < rad * 2.2 ? 0.25 : 0; }
    let over = 0;
    for (const a of ctx.avoid ?? []) {
      const nx = clamp(x, a[0], a[0] + a[2]), ny = clamp(y, a[1], a[1] + a[3]);
      if (Math.hypot(x - nx, y - ny) < rad * 1.1) over = 1;
    }
    parts.avoid = over * 3;
    if (ctx.target) {
      const tr = ctx.target, nx = clamp(x, tr[0], tr[0] + tr[2]), ny = clamp(y, tr[1], tr[1] + tr[3]), d = Math.hypot(x - nx, y - ny);
      // Beside it: a gap of about half a radius to a radius and a half is ideal; on it is worst; far away is poor.
      parts.target = d < rad * 1.2 ? 2.2 : clamp((d - rad * 1.2) / (rad * 6), 0, 1) * 1.1 - 0.5;
    }
    // Out of the way by habit: a slight pull to the right half and the lower part of the screen.
    const u = (x - S.l) / (S.r - S.l), v = (y - S.t) / (S.b - S.t);
    parts.habit = (1 - u) * 0.06 + (1 - v) * 0.03;
    if (ctx.here) {
      const d = Math.hypot(x - ctx.here[0], y - ctx.here[1]);
      // Staying is free; a move costs something whatever its length, and a little more the further it is.
      parts.stay = d < rad * 0.5 ? -0.16 : 0.04 * clamp(d / Math.hypot(S.r - S.l, S.b - S.t), 0, 1);
    }
    let total = 0;
    for (const k in parts) total += parts[k];
    return { score: total, parts };
  };

  // Candidate spots: a grid over the screen, the gaps just outside each window's edges, the screen's corners and
  // edge-middles, around the target, and where it is now.
  const candidates = (ctx) => {
    const { screen: S, windows = [], rad } = ctx, out = [], pad = rad * 1.15;
    const l = S.l + pad, r = S.r - pad, t = S.t + pad, b = S.b - pad;
    if (r <= l || b <= t) return [[(S.l + S.r) / 2, (S.t + S.b) / 2]];
    const nx = Math.max(3, Math.min(9, Math.round((r - l) / (rad * 1.2)))), ny = Math.max(3, Math.min(6, Math.round((b - t) / (rad * 1.2))));
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) out.push([l + ((r - l) * i) / nx, t + ((b - t) * j) / ny]);
    const gap = rad * 1.2;
    for (const w of windows.slice(0, 8)) {
      const [x, y, ww, hh] = w.rect;
      for (const f of [0.2, 0.5, 0.8]) out.push([x - gap, y + hh * f], [x + ww + gap, y + hh * f], [x + ww * f, y - gap], [x + ww * f, y + hh + gap]);
      // Just inside its quiet right edge and lower corners, for when the window fills the screen.
      out.push([x + ww - gap, y + hh * 0.5], [x + ww - gap, y + hh - gap], [x + gap, y + hh - gap], [x + ww - gap, y + gap * 1.2]);
    }
    if (ctx.target) {
      const [x, y, ww, hh] = ctx.target, g = rad * 1.8;
      out.push([x - g, y + hh / 2], [x + ww + g, y + hh / 2], [x + ww / 2, y - g], [x + ww / 2, y + hh + g], [x + ww + g, y - g * 0.4], [x - g, y - g * 0.4]);
    }
    if (ctx.here) out.push(ctx.here.slice());
    return out.map(([x, y]) => [clamp(x, l, r), clamp(y, t, b)]);
  };

  // The best spot, and the next ones that are nearly as good and somewhere else (for variety when idle).
  const best = (ctx) => {
    const seen = candidates(ctx).map(([x, y]) => ({ x, y, ...score(x, y, ctx) })).sort((a, b) => a.score - b.score);
    const top = seen[0], others = [];
    for (const c of seen) {
      if (others.length >= 3 || c.score > top.score + 0.14) break;
      if ([top, ...others].every((o) => Math.hypot(o.x - c.x, o.y - c.y) > ctx.rad * 2)) others.push(c);
    }
    const here = ctx.here ? score(ctx.here[0], ctx.here[1], ctx) : null;
    return { ...top, others, here: here?.score ?? null };
  };

  R.place = {
    windows: [], rev: 0, at: 0,
    // The layout from the hands helper: [{ bounds: [x, y, w, h] in screen points, front }], front to back.
    feed(list, toLocal = R.ink?.toLocal) {
      const next = [];
      for (const w of list ?? []) {
        const r = Array.isArray(w.bounds) && w.bounds.length === 4 && w.bounds.every(Number.isFinite) ? (toLocal ? toLocal(w.bounds) : w.bounds) : null;
        if (r && r[2] > 40 && r[3] > 40) next.push({ rect: r.map(Math.round), front: !!w.front });
      }
      const sig = JSON.stringify(next);
      if (sig !== this.sig) { this.sig = sig; this.windows = next; this.rev++; }
      this.at = performance.now();
    },
    score, best, candidates, worth,
  };
})();
