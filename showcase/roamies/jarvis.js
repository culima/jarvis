// JARVIS look for the sidekick: no face and no body. A globe made of code: hundreds of separate fragments (specks,
// words, and letters of code on the nearest ones) on three shells round a lit heart, in bands that drift at their own
// paces. It opens and closes with the voice, syllable by syllable; in thought the bands race against each other and
// the letters are rewritten; asleep it draws in small and dim; loose snippets drift off it and fade.
// Drawing, and at the Cursor size, it is the same globe, small, with a tick at its tip; the moments the goo blob acts
// out (heart, bolt, alarm, anger, flame) become HUD read-outs here.
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
  // The fragments: each a snippet of code with its own shell (most on the outer one, some on two inner ones), moment
  // (phi), length, letter, and how far it stands off when the voice opens the globe. Their places on the globe come
  // from their number, so however many a size draws, they cover it evenly.
  const FRAGS = (() => {
    const next = stream(20261116);
    return Array.from({ length: 1900 }, () => {
      const pick = next() % 100;
      return { shell: pick < 62 ? 1 : pick < 88 ? 0.76 : 0.52, phi: (next() % 6283) / 1000, len: next() % 4, glyph: next() % 97, kind: (next() % 1000) / 1000, far: (next() % 1000) / 1000 };
    });
  })();
  // The shards: plates of the globe, each with its own height, pace and reach; a few are open (nearly empty).
  const PLATES = (() => {
    const next = stream(77003);
    return Array.from({ length: 22 }, (_, n) => {
      const y = 1 - (2 * (n + 0.5)) / 22, ring = Math.sqrt(1 - y * y), a = n * 2.399963 + (next() % 1000) / 900;
      return { x: Math.cos(a) * ring, y, z: Math.sin(a) * ring, h: -0.2 + (next() % 1000) / 2600, open: next() % 6 === 0, pace: 0.5 + (next() % 1000) / 600, phi: (next() % 6283) / 1000, far: (next() % 1000) / 1000 };
    });
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
      if (st.mode === 'talk' && st.voice != null) return clamp(st.voice * 1.25, 0, 1); // the real voice: closed in the gaps
      if (st.mode === 'talk') return clamp(0.9 * Math.abs(Math.sin(t * 5.2)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 1.7 + 1))), 0, 1);
      if (st.mode === 'listen') return clamp(st.heard ?? 0.35 + 0.3 * Math.abs(Math.sin(t * 4.1)), 0, 1);
      if (st.mode === 'think') return 0.25;
      return 0.12 + 0.05 * Math.sin(t * 1.4);
    },

    // The body: a globe made of code. st: { t, mode, voice, act, actA, open, look:[x,y], speed, sq, wide, dizzy, sleepy }
    // cx, cy are cells; rad the radius in cells. put(x, y, level) writes a cell, the brightest write wins.
    body(k, cx, cy, rad, st) { this.globe(k, cx, cy, rad, st, false); },

    // The globe itself, at any size (the cursor form is a small one). Hundreds of separate fragments of code (specks,
    // words, and letters on the nearest ones) sit on three shells round the heart, in bands that drift round at their
    // own paces. It swells and closes with the voice, syllable by syllable; in thought every band races its own way
    // and the letters are rewritten as fast as they can be read; asleep it draws in small and dim.
    globe(k, cx, cy, rad, st, mini) {
      const { put, L, th } = k, t = st.t, dt = st.dt ?? 0.016;
      const mode = st.mode, A = st.act;
      // The breath: the voice's level (its own when it talks, the user's when it listens), taken the way a meter
      // takes it: up at once, back down slowly. One easy swell per phrase instead of a flutter.
      const raw = this.level(st);
      st.breath = (st.breath ?? 0) + (raw - (st.breath ?? 0)) * Math.min(1, dt * (raw > (st.breath ?? 0) ? 22 : 5));
      const v = mode === 'talk' || mode === 'listen' ? st.breath : raw;
      const sleepy = st.sleepy > 0.5, talking = mode === 'talk' || mode === 'listen', thinking = mode === 'think';
      // Turn: the whole globe, slowly. Churn: the bands against each other, a crawl at rest and a race in thought.
      st.spin = (st.spin ?? 0) + (thinking ? 0.9 : A === 'hype' ? 3.2 : sleepy ? 0.05 : talking ? 0.4 : 0.24) * dt;
      st.churn = (st.churn ?? 0) + (thinking ? 4.6 : A === 'hype' ? 2.4 : sleepy ? 0 : talking ? 0.3 + v * 0.5 : 0.1) * dt;
      // Swell: how far it has opened. It follows the voice closely (out fast, back a little slower), so it opens
      // on each syllable and closes in the gaps; a cheer pops it, thought holds it a touch open.
      const want = sleepy ? -0.12 : mode === 'talk' ? 0.4 * v : mode === 'listen' ? 0.24 * v : A === 'hype' ? 0.3 * Math.abs(Math.sin(t * 6.5)) : thinking ? 0.08 + 0.04 * Math.sin(t * 9) : 0.02 * Math.sin(t * 1.4);
      const was = st.swell ?? 0;
      st.swell = was + (want - was) * Math.min(1, dt * (want > was ? 18 : 9));
      st.fold = (st.fold ?? 0) + ((sleepy ? 1 : 0) - (st.fold ?? 0)) * Math.min(1, dt * 3);
      const fold = st.fold, swell = st.swell, dim = fold > 0.5 ? 1 : 0;
      const wobble = st.dizzy > 0.5 ? Math.sin(t * 9) * 0.3 : 0;
      // It tips toward where it's looking, and sways.
      const lean = turner(st.look[0] * 0.45, -0.42 + 0.1 * Math.sin(t * 0.41) + st.look[1] * 0.25 + wobble, 0.12 * Math.sin(t * 0.53));
      // Squash from the body's bounces, and a shake when it's upset.
      const sq = st.sq ?? 0, sx = 1 + sq * 0.05, sy = 1 - sq * 0.04;
      const shake = A === 'upset' && (st.actA ?? 0) % 0.9 < 0.32 ? Math.sin(t * 48) * 0.6 : 0;
      const size = rad * (1 - fold * 0.4) * (1 + swell);
      // Detail by size: the fragments cover the globe about as densely at every size, and the nearest are written
      // out as letters of code once there's room. (In cells the radius is about 6 small, 13 default, 28 large, 56 huge.)
      const count = Math.round(clamp(rad * rad * 0.62, mini ? 46 : 96, FRAGS.length)), letters = rad >= 18, words = rad >= 11;
      const BANDS = rad >= 40 ? 15 : rad >= 20 ? 11 : 7;
      // In thought, a bright front sweeps over the globe from pole to pole.
      const front = thinking ? ((t * 1.3) % 1) * 2.4 - 1.2 : 9;
      for (let i = 0; i < count; i++) {
        const f = FRAGS[i];
        // Its place: spread evenly over the globe (a golden spiral), on its shell, in its band.
        const y = 1 - (2 * (i + 0.5)) / count, ring = Math.sqrt(1 - y * y), band = Math.floor(((y + 1) / 2) * BANDS);
        const way = band % 2 ? 1 : -1, own = 0.6 + ((band * 7) % 5) * 0.22;
        // In thought the fragments also jump about in their bands.
        const jump = thinking ? 0.22 * Math.sin(t * (11 + f.kind * 9) + f.phi) : 0;
        const own0 = i * 2.399963 + st.churn * way * own + jump;
        let px = Math.cos(own0) * ring, pz = Math.sin(own0) * ring;
        // The globe is broken into shards: plates that stand at their own heights, with cracks between them and a
        // few missing altogether, so the inside shows. The fragments stream through them, rising and sinking as they
        // cross from one to the next. With the voice the shards part, each by its own amount.
        let best = -2, next2 = -2, P = PLATES[0];
        if (f.shell === 1) for (const pl of PLATES) { const d = px * pl.x + y * pl.y + pz * pl.z; if (d > best) { next2 = best; best = d; P = pl; } else if (d > next2) next2 = d; }
        const outer = f.shell === 1;
        if (outer && !mini && (best - next2 < 0.03 || (P.open && f.kind > 0.14))) continue;
        const lift = outer ? P.h + 0.035 * Math.sin(t * P.pace + P.phi) + (talking ? v * P.far * 0.15 : 0) + (thinking ? 0.06 * Math.sin(t * 9 + P.phi) : 0) : 0;
        const r = f.shell * (1 + lift + (f.far - 0.5) * 0.09 + (talking ? v * f.far * 0.1 : 0) + (thinking ? 0.05 * Math.sin(t * 14 + f.phi) : 0));
        const cs = Math.cos(st.spin), sn = Math.sin(st.spin);
        [px, pz] = [px * cs - pz * sn, px * sn + pz * cs];
        const q = lean([px * r, y * r, pz * r]);
        // Nearer is bigger: the front bulges toward you and the back falls away.
        const s = 1 + q[2] * 0.3, x = Math.round(cx + q[0] * size * s * sx + shake), yy = Math.round(cy + q[1] * size * s * sy), z = q[2];
        const lit = Math.abs(y - front) < 0.12 || (st.happy > 0.5 && i % 7 === 0) || (talking && v > 0.55 && (i + Math.floor(t * 9)) % 8 === 0) || (i + Math.floor(t * 1.7 + f.phi)) % 23 === 0;
        // Far fragments are specks, nearer ones dashes (a word), the nearest are written out: a letter of code.
        // The far side shows through only as a scatter, so the heart is seen through the gaps.
        if (z < -0.2) { if (th(x, yy) < 0.3 + z * 0.22) put(x, yy, 1); continue; }
        if (z < 0.15 || !words) { for (let w = 0; w <= (words ? f.len % 2 : 0); w++) put(x + w, yy, clamp((z > -0.05 ? 2 : 1) + (lit ? 1 : 0) - dim, 1, L - 1)); continue; }
        if (z < 0.5 || !letters || f.kind > 0.4) { for (let w = 0; w < 1 + (f.len % 3); w++) put(x + w, yy, clamp((z > 0.4 ? 3 : 2) + (lit ? 1 : 0) - dim, 1, L - (lit ? 0 : 1))); continue; }
        // In thought the letters are rewritten over and over.
        const rows = GLYPHS[(f.glyph + (thinking ? Math.floor(t * 14 + f.phi) : 0)) % GLYPHS.length], lvl = clamp(3 + (lit ? 1 : 0) - dim, 1, L);
        for (let gr = 0; gr < 5; gr++) for (let c = 0; c < 3; c++) if (rows[gr][c] === '#') put(x + c - 1, yy + gr - 2, lvl);
      }
      if (mini) return;
      // The heart, inside the globe: a bright diamond that swells with the voice, follows the cursor a little,
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
      // Loose snippets: short words of code that leave the globe, drift outward and fade, more of them while it
      // talks or thinks. Each has its own direction, length and moment.
      if (words) {
        const many = (thinking ? 26 : talking ? 18 : 9) * (rad >= 40 ? 1.8 : rad >= 20 ? 1 : 0.5), life = thinking ? 1.3 : 2.6;
        for (let n = 0; n < many; n++) {
          const born = Math.floor((t + n * 0.37) / life), age = ((t + n * 0.37) % life) / life;
          const next = stream(n * 7919 + born * 104729);
          const ang = (next() % 6283) / 1000, word = 2 + (next() % 4), start = 1.1 + swell + (next() % 20) / 100;
          const d = rad * (start + age * (0.3 + (next() % 30) / 100));
          const x0 = cx + Math.cos(ang) * d, y0 = cy + Math.sin(ang) * d * 0.92;
          const lvl = age < 0.15 ? 3 : age < 0.5 ? 2 : 1;
          for (let w = 0; w < word; w++) { if (age > 0.7 && th(Math.floor(x0 + w), Math.floor(y0)) < age - 0.25) continue; put(x0 + w, y0, lvl); }
        }
      }
    },

    // Cursor form (the pen it draws with, and the Cursor size): the same globe of code, small, round the body point
    // (cx, cy), with a bright tick from the hotspot (hx, hy), where the arrow's tip would be, so it still reads as a
    // pointer. Its heart closes to a line on a blink and dims asleep.
    cursor(k, cx, cy, hx, hy, st) {
      const { put, L } = k;
      this.globe(k, cx, cy, 5.4, st, true);
      if (st.sleepy > 0.5) put(cx, cy, 2);
      else if (st.open < 0.35) { put(cx - 1, cy, L - 1); put(cx, cy, L); put(cx + 1, cy, L - 1); }
      else { put(cx, cy, L); put(cx + 1, cy, L - 1); put(cx - 1, cy, L - 1); put(cx, cy + 1, L - 1); put(cx, cy - 1, L - 1); }
      const dx = cx - hx, dy = cy - hy, n = Math.hypot(dx, dy) || 1;
      for (let i = 0; i <= 2; i++) put(hx + (dx / n) * i, hy + (dy / n) * i, i === 0 ? L : L - 1);
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
