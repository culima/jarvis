// JARVIS look for the sidekick: no face and no body. A double helix written in code: two strands of fragments
// (specks, words, and letters of code on the nearest ones) climbing and turning round a lit heart, lines of code
// strung between them, and a haze of code round it: hundreds of separate pieces. The voice sends ripples up the
// helix, thought spins it and unzips it (the lines break in the middle) with pulses running up the strands, asleep
// it coils small and dim; loose snippets drift off it and fade.
// The cursor form is a HUD reticle, and the moments the goo blob acts out (heart, bolt, alarm, anger, flame)
// become HUD read-outs here.
// Everything else (following, bubbles, tools, sizes) is the same sidekick; 10-dither.js calls into this when
// the look is 'jarvis'. Pure drawing: it only writes LED cells through the kit it's given.
(() => {
  const R = window.Roamie;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  // A repeatable stream of numbers from a seed.
  const stream = (seed) => { let s = (seed * 2654435761) >>> 0; return () => (s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) >>> 9; };
  // The fragments: each a snippet of code with its own height on the helix (y, -1 to 1, spread evenly so any first
  // part of the list covers the whole height: smaller sizes draw fewer), its offset from the strand's line (rho),
  // its angle and moment (phi), length, letter, and how far it flies when the helix comes apart.
  const FRAGS = (() => {
    const next = stream(20261115), n = 440;
    return Array.from({ length: n }, (_, i) => ({
      y: (((i >> 1) * 0.6180339887) % 1) * 2 - 1, phi: (next() % 6283) / 1000, rho: (next() % 1000) / 1000,
      len: next() % 4, glyph: next() % 97, kind: (next() % 1000) / 1000, far: (next() % 1000) / 1000,
    }));
  })();
  // Letters of code, 3 by 5 cells, for the nearest fragments.
  const GLYPHS = [
    ['###', '#.#', '#.#', '#.#', '###'], ['.#.', '##.', '.#.', '.#.', '###'], ['.##', '.#.', '#..', '.#.', '.##'], ['##.', '.#.', '..#', '.#.', '##.'],
    ['..#', '.#.', '#..', '.#.', '..#'], ['#..', '.#.', '..#', '.#.', '#..'], ['..#', '..#', '.#.', '#..', '#..'], ['...', '.#.', '...', '.#.', '#..'],
    ['...', '###', '...', '###', '...'], ['...', '.#.', '###', '.#.', '...'], ['##.', '#..', '#..', '#..', '##.'], ['.##', '..#', '..#', '..#', '.##'],
    ['#.#', '###', '#.#', '###', '#.#'], ['.#.', '#..', '#..', '#..', '.#.'], ['.#.', '..#', '..#', '..#', '.#.'], ['###', '..#', '.#.', '...', '.#.'],
  ];
  // Turns a point by yaw (round the upright axis), then pitch, then roll.
  const turner = (yaw, pitch, roll) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    return (p) => {
      const x = p[0] * cy + p[2] * sy, z0 = -p[0] * sy + p[2] * cy;
      const y = p[1] * cp - z0 * sp, z = p[1] * sp + z0 * cp;
      return [x * cr - y * sr, x * sr + y * cr, z];
    };
  };

  // HUD glyphs for the blob's moments, drawn as read-outs beside the globe: heart, bolt, alarm, anger, flame.
  const GLYPH = {
    heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
    bolt: ['...##', '..##.', '.##..', '#####', '..##.', '.##..', '##...'],
    excl: ['##', '##', '##', '##', '..', '##'],
    clock: ['..###..', '.#...#.', '#..#..#', '#..##.#', '#.....#', '.#...#.', '..###..'],
    anger: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    flame: ['..#...', '..##..', '.###.#', '.#####', '######', '##.###', '#...##', '.####.'],
  };

  R.jarvis = {
    // Voice level: rises while it talks or hears you, settles to a slow breath otherwise.
    level(st) {
      const t = st.t;
      if (st.mode === 'talk' && st.voice != null) return clamp(0.3 + st.voice * 0.9, 0, 1); // the real voice
      if (st.mode === 'talk') return clamp(0.45 + 0.35 * Math.abs(Math.sin(t * 11.3)) * Math.abs(Math.sin(t * 2.9 + 1)) + 0.2 * Math.sin(t * 23), 0, 1);
      if (st.mode === 'listen') return clamp(st.heard ?? 0.35 + 0.3 * Math.abs(Math.sin(t * 4.1)), 0, 1);
      if (st.mode === 'think') return 0.25;
      return 0.12 + 0.05 * Math.sin(t * 1.4);
    },

    // The body: a double helix written in code. st: { t, mode, act, actA, open, look:[x,y], speed, sq, wide, dizzy, sleepy }
    // cx, cy are cells; rad the radius in cells. put(x, y, level) writes a cell, the brightest write wins.
    body(k, cx, cy, rad, st) {
      const { put, L, th } = k, t = st.t, dt = st.dt ?? 0.016;
      const v = this.level(st);
      const mode = st.mode, A = st.act;
      const sleepy = st.sleepy > 0.5, talking = mode === 'talk' || mode === 'listen', thinking = mode === 'think';
      // The helix turns on its axis and its code climbs it: faster with the voice, fastest in thought.
      st.spin = (st.spin ?? 0) + (thinking ? 2.4 : A === 'hype' ? 5 : sleepy ? 0.12 : talking ? 1.1 : 0.55) * dt;
      st.flow = (st.flow ?? 0) + (thinking ? 0.5 : A === 'hype' ? 0.9 : sleepy ? 0.02 : talking ? 0.16 + v * 0.2 : 0.07) * dt;
      // Apart: how far the two strands stand from each other. In thought the helix unzips (the lines of code
      // between the strands break in the middle), a cheer pops it, the voice breathes it. Fold: asleep it coils small.
      const apart = sleepy ? 0 : thinking ? 0.5 + 0.12 * Math.sin(t * 2.6) : A === 'hype' ? 0.4 * Math.abs(Math.sin(t * 6.5)) : talking ? 0.1 * v : 0.02 + 0.02 * Math.sin(t * 1.4);
      st.apart = (st.apart ?? 0) + (apart - (st.apart ?? 0)) * Math.min(1, dt * 6);
      st.fold = (st.fold ?? 0) + ((sleepy ? 1 : 0) - (st.fold ?? 0)) * Math.min(1, dt * 3);
      const fold = st.fold, ex = st.apart, dim = fold > 0.5 ? 1 : 0;
      const wobble = st.dizzy > 0.5 ? Math.sin(t * 9) * 0.3 : 0;
      // It leans a little, toward where it's looking, and sways.
      const lean = turner(0, 0.16 * Math.sin(t * 0.41) + st.look[1] * 0.2, 0.2 + 0.1 * Math.sin(t * 0.53) + st.look[0] * 0.28 + wobble);
      // Squash from the body's bounces, and a shake when it's upset.
      const sx = 1 + st.sq * 0.05, sy = 1 - st.sq * 0.04;
      const shake = A === 'upset' && st.actA % 0.9 < 0.32 ? Math.sin(t * 48) * 0.6 : 0;
      const size = rad * (1 - fold * 0.5) * (1 + (sleepy ? 0.03 : 0.012) * Math.sin(t * 1.4)) * (A === 'hype' ? 1.08 : 1);
      // A turned point on screen: cells, with its depth (toward the viewer is positive). A touch of perspective.
      const at = (q) => { const s = 1 + q[2] * 0.16; return [cx + q[0] * size * s * sx + shake, cy + q[1] * size * s * sy, q[2]]; };
      // Detail by size: how many fragments on the strands, lines between them and specks around, and whether the
      // nearest fragments are written out as letters of code.
      // (In cells the body's radius is about 6 small, 13 default and 28 large.)
      const big = rad >= 20, mid = rad >= 11;
      const beads = big ? 180 : mid ? 96 : 50, rungs = big ? 34 : mid ? 16 : 8, specks = big ? 130 : mid ? 44 : 0, letters = rad >= 18;
      const TURNS = 1.85 * Math.PI, TALL = 1.3, WIDE = 0.5;
      // A point of a strand at height y (-1 bottom to 1 top): the helix is widest in the middle and narrows to its
      // ends; the voice sends ripples up it.
      const strand = (y, which, off) => {
        const ripple = talking ? v * 0.3 * Math.sin(y * 7 - t * (mode === 'talk' ? 10 : 5)) : 0;
        const r = WIDE * Math.sqrt(Math.max(0.08, 1 - y * y * 0.74)) * (1 + ripple) * (1 + ex * 0.75) + off;
        const a = y * TURNS + st.spin + which * Math.PI;
        return lean([Math.sin(a) * r, -y * TALL, Math.cos(a) * r]);
      };
      // Everything climbs: a height that wraps from the top back to the bottom.
      const climb = (y0) => (((y0 + st.flow + 1) % 2) + 2) % 2 - 1;
      // In thought, pulses of light run up the strands.
      const pulse = (y) => { if (!thinking) return false; const d = ((y - t * 1.6) % 0.7 + 0.7) % 0.7; return d < 0.09; };
      // The lines of code between the strands, drawn first so the strands lie over their ends: each a row of short
      // words with its own indent and length. Unzipped, each line breaks in the middle and its halves hang from
      // their strands. In thought the lines are rewritten again and again.
      for (let j = 0; j < rungs; j++) {
        const y = climb(((j + 0.5) / rungs) * 2 - 1), edge = 1 - Math.abs(y);
        if (edge < 0.06) continue;
        const a = at(strand(y, 0, 0)), b = at(strand(y, 1, 0));
        const len = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]));
        if (len < 4) continue;
        const next = stream(j * 977 + (thinking ? Math.floor(t * 5) * 131 : 0) + 7);
        let pos = 1 + (next() % 3);
        while (pos < len - 1) {
          const word = 1 + (next() % 4), lit = next() % 6 === 0 || (talking && v > 0.55 && next() % 4 === 0);
          for (let w = 0; w < word && pos + w < len - 1; w++) {
            const f = (pos + w) / len;
            if (Math.abs(f - 0.5) < ex * 0.42) continue; // unzipped
            const x = a[0] + (b[0] - a[0]) * f, y2 = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
            if (z < -0.3 || edge < 0.14) { if (th(Math.floor(x), Math.floor(y2)) < 0.6) put(x, y2, 1); continue; }
            put(x, y2, clamp((z > 0.1 ? 3 : 2) + (lit ? 1 : 0) - dim - (z < -0.1 ? 1 : 0), 1, L - 1));
          }
          pos += word + 1 + (next() % 2);
        }
      }
      // The strands: fragments of code strung along both, climbing. Far ones are specks, nearer ones dashes (a
      // word), the nearest are written out: a letter or two of code.
      for (let i = 0; i < beads; i++) {
        const f = FRAGS[i], y = climb(f.y), edge = 1 - Math.abs(y);
        const q = strand(y, i & 1, (f.rho - 0.55) * 0.16 * (1 + ex * 3 * f.far));
        const s = at(q), x = Math.round(s[0]), yy = Math.round(s[1]), z = q[2];
        const lit = pulse(y) || (st.happy > 0.5 && i % 7 === 0) || (talking && v > 0.6 && (i + Math.floor(t * 8)) % 9 === 0) || (i + Math.floor(t * 1.7 + f.phi)) % 23 === 0;
        if (edge < 0.1) { if (th(x, yy) < edge * 8) put(x, yy, 1); continue; }
        if (z < -0.22) { if (th(x, yy) < 0.8) put(x, yy, lit ? 2 : 1); continue; }
        if (z < 0.1 || !mid) { for (let w = 0; w <= (big ? 1 + (f.len % 2) : mid ? f.len % 2 : 0); w++) put(x + w, yy, clamp(2 + (lit ? 1 : 0) - dim, 1, L - 1)); continue; }
        if (z < 0.24 || !letters || f.kind > 0.42) { for (let w = 0; w < (big ? 2 + (f.len % 3) : 1 + (f.len % 2)); w++) put(x + w, yy, clamp(3 + (lit ? 1 : 0) - dim, 1, L)); continue; }
        const lvl = clamp(3 + (lit ? 1 : 0) - dim, 1, L), rows = GLYPHS[f.glyph % GLYPHS.length];
        for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (rows[r][c] === '#') put(x + c - 1, yy + r - 2, lvl);
      }
      // A haze of code round it: specks and short words on slow, wide orbits, the near ones brighter.
      for (let i = 0; i < specks && !dim; i++) {
        const f = FRAGS[FRAGS.length - 1 - i], y = climb(f.y * 0.999 + i * 0.37) * 0.92;
        const r = (0.82 + f.far * 0.42) * Math.sqrt(Math.max(0.1, 1 - y * y * 0.6)) * (1 + ex * 0.4), a = f.phi + st.spin * (0.25 + f.kind * 0.3) * (i & 1 ? 1 : -1);
        const q = lean([Math.sin(a) * r, -y * TALL * 0.95, Math.cos(a) * r]), s = at(q), x = Math.round(s[0]), yy = Math.round(s[1]);
        if (q[2] < 0) { if (th(x, yy) < 0.45) put(x, yy, 1); continue; }
        for (let w = 0; w <= f.len % 3; w++) put(x + w, yy, q[2] > 0.5 && f.kind > 0.6 ? 2 : 1);
      }
      // The heart, between the strands: a bright diamond that swells with the voice, follows the cursor a little,
      // closes to a line on a blink and dims to a dot asleep.
      const open = st.open;
      const hr = Math.max(1, Math.round(rad * (sleepy ? 0.06 : 0.09 + v * 0.05) * (A === 'hype' ? 1.25 : 1)));
      const hx = Math.round(cx + st.look[0] * rad * 0.12 + shake), hy = Math.round(cy + st.look[1] * rad * 0.1);
      const hh = Math.max(0, Math.round(hr * (st.wide > 0.5 ? 1.25 : Math.min(1, open))));
      for (let y = -hr - 1; y <= hr + 1; y++) for (let x = -hr - 1; x <= hr + 1; x++) {
        const d = Math.abs(x) / (hr + 0.5) + Math.abs(y) / (hh + 0.5 || 0.5);
        if (d > 1.3) continue;
        put(hx + x, hy + y, d < 0.6 ? L : d < 1 ? L - 1 : 2);
      }
      if (hh === 0) for (let x = -hr; x <= hr; x++) put(hx + x, hy, L);
      if (sleepy) return;
      // Loose snippets: short words of code that leave the helix, drift outward and fade, more of them while it
      // talks or thinks. Each has its own direction, length and moment.
      if (mid) {
        const many = (thinking ? 22 : talking ? 18 : 10) * (big ? 1 : 0.5), life = 2.6;
        for (let n = 0; n < many; n++) {
          const born = Math.floor((t + n * 0.37) / life), age = ((t + n * 0.37) % life) / life;
          const next = stream(n * 7919 + born * 104729);
          const ang = (next() % 6283) / 1000, word = 2 + (next() % 4), start = 1.12 + (next() % 20) / 100;
          const d = rad * (start + age * (0.4 + (next() % 30) / 100));
          const x0 = cx + Math.cos(ang) * d, y0 = cy + Math.sin(ang) * d * 0.92;
          const lvl = age < 0.15 ? 3 : age < 0.5 ? 2 : 1;
          for (let w = 0; w < word; w++) { if (age > 0.7 && th(Math.floor(x0 + w), Math.floor(y0)) < age - 0.25) continue; put(x0 + w, y0, lvl); }
        }
      }
    },

    // Cursor form: a HUD reticle round the body point (cx, cy), its lit heart in the middle and a tick at the
    // hotspot (hx, hy), where the arrow's tip would be. It holds still at rest (the native follower shows a still
    // picture of it while it follows); it turns while it thinks or talks.
    cursor(k, cx, cy, hx, hy, st) {
      const { put, L } = k, t = st.t, v = this.level(st), A = st.act;
      const busy = st.mode === 'think' || st.mode === 'talk' || st.mode === 'listen' || !!A;
      const spin = busy ? (st.spin = (st.spin ?? 0) + (st.mode === 'think' ? 2.4 : 0.9) * (st.dt ?? 0.016)) : (st.spin ?? 0);
      // Four ring arcs with gaps; the voice pushes them out a touch.
      const r = 4.6 + (st.mode === 'talk' || st.mode === 'listen' ? v * 1.1 : 0) + (A === 'hype' ? 0.8 * Math.abs(Math.sin(t * 6.5)) : 0);
      for (let i = 0; i < 64; i++) {
        if (((i + 4) % 16) < 3) continue;
        const a = (i / 64) * TAU + spin;
        put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3);
      }
      // Bracket ticks at the diagonals.
      for (let q = 0; q < 4; q++) {
        const a = q * (TAU / 4) + TAU / 8 - spin * 0.3;
        for (let d = 6.4; d <= 7.4; d += 0.5) put(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2);
      }
      // The heart: a dot that closes to a line on a blink and dims asleep; a cross while it talks.
      const sleepy = st.sleepy > 0.5;
      if (sleepy) put(cx, cy, 2);
      else if (st.open < 0.35) { put(cx - 1, cy, L - 1); put(cx, cy, L); put(cx + 1, cy, L - 1); }
      else {
        put(cx, cy, L); put(cx + 1, cy, L - 1); put(cx - 1, cy, L - 1); put(cx, cy + 1, L - 1); put(cx, cy - 1, L - 1);
        if (st.mode === 'talk' && v > 0.55) for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) put(cx + dx, cy + dy, 2);
      }
      // Dizzy: the heart wanders; happy: a little arc of light over it.
      if (st.happy > 0.5) for (let i = -2; i <= 2; i++) put(cx + i, cy - 2 - (Math.abs(i) === 2 ? 0 : 1), 3);
      // The hotspot: a short bright tick from the tip toward the ring, so it still reads as a pointer.
      const dx = cx - hx, dy = cy - hy, n = Math.hypot(dx, dy) || 1;
      for (let i = 0; i <= 2; i++) put(hx + (dx / n) * i, hy + (dy / n) * i, i === 0 ? L : L - 1);
      // Thinking: one bright dot chasing round the ring.
      if (st.mode === 'think') { const a = t * 5; put(cx + Math.cos(a) * r, cy + Math.sin(a) * r, L); }
    },

    // The blob's moments as HUD read-outs: a bracketed panel with the glyph, a pulsing ring and a short label.
    // Returns nothing; draws with put. gx, gy: the panel's bottom-centre cell.
    readout(k, gx, gy, icon, a, dur, small) {
      const { put, L } = k;
      const rows = GLYPH[icon];
      if (!rows) return;
      const sc = small ? 1 : 2, w = rows[0].length * sc, h = rows.length * sc;
      // Brackets fly out from the glyph and settle; they close again at the end.
      const open = smooth(a / 0.22) * (1 - smooth((a - (dur - 0.2)) / 0.2));
      if (open < 0.02) return;
      const pad = Math.round(2 + 2 * open), x0 = gx - Math.ceil(w / 2) - pad, x1 = gx + Math.floor(w / 2) + pad, y0 = gy - h - pad * 2, y1 = gy;
      const arm = Math.max(1, Math.round(3 * open));
      for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        for (let i = 0; i <= arm; i++) { put(x + dx * i, y, L - 1); put(x, y + dy * i, L - 1); }
      }
      // A scan line drops through the panel as it opens.
      if (a < 0.4) { const sy = Math.round(y0 + (y1 - y0) * (a / 0.4)); for (let x = x0 + 1; x < x1; x++) put(x, sy, 2); }
      // The glyph: hot cells, flickering in like a projector for its first moment.
      if (a > 0.12) rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) if (row[i] === '#') {
          if (a < 0.3 && ((i * 7 + j * 3 + Math.floor(a * 40)) % 3) === 0) continue;
          for (let p = 0; p < sc; p++) for (let q = 0; q < sc; q++) put(gx - Math.ceil(w / 2) + i * sc + q, y0 + pad + j * sc + p, L);
        }
      });
      // A small bar under the panel fills over the moment, like a HUD timer.
      const fill = Math.round((x1 - x0 - 2) * clamp(a / dur, 0, 1));
      for (let x = 0; x <= x1 - x0 - 2; x++) put(x0 + 1 + x, y1 + 2, x <= fill ? 2 : 1);
    },
  };
})();
