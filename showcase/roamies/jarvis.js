// JARVIS look for the sidekick: no face and no body. A crystal of light made of code: a shell of twenty facets,
// each a pane of scrolling lines of code (hundreds of little words of light), turning round a smaller,
// counter-turning core with a lit heart, with shards in orbit and loose snippets drifting off it. The voice pushes the shell's points out
// like a star; thinking lifts the facets apart and sends pulses along their edges; asleep it folds small and dim.
// The cursor form is a HUD reticle, and the moments the goo blob acts out (heart, bolt, alarm, anger, flame)
// become HUD read-outs here.
// Everything else (following, bubbles, tools, sizes) is the same sidekick; 10-dither.js calls into this when
// the look is 'jarvis'. Pure drawing: it only writes LED cells through the kit it's given.
(() => {
  const R = window.Roamie;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  // The shell is an icosahedron (12 points, 20 facets), the core an octahedron. All on the unit sphere.
  const unit = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const PHI = (1 + Math.sqrt(5)) / 2;
  const ICO = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]].map(unit);
  const OCT = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // Points next to each other (an icosahedron's neighbours are 63° apart, an octahedron's 90°).
  const edges = (V, min) => { const e = []; for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (dot(V[i], V[j]) > min) e.push([i, j]); return e; };
  const ICO_E = edges(ICO, 0.4), OCT_E = edges(OCT, -0.5);
  const near = new Set(ICO_E.map(([i, j]) => i * 12 + j));
  const ICO_F = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let l = j + 1; l < 12; l++) if (near.has(i * 12 + j) && near.has(j * 12 + l) && near.has(i * 12 + l)) ICO_F.push([i, j, l, unit([ICO[i][0] + ICO[j][0] + ICO[l][0], ICO[i][1] + ICO[j][1] + ICO[l][1], ICO[i][2] + ICO[j][2] + ICO[l][2]])]);
  // Finer points for the larger sizes: the middle of every edge, pushed out to the sphere.
  const MIDS = ICO_E.map(([i, j]) => unit([ICO[i][0] + ICO[j][0], ICO[i][1] + ICO[j][1], ICO[i][2] + ICO[j][2]]));
  // Turns a point by yaw (round the upright axis), then pitch, then roll.
  const turner = (yaw, pitch, roll) => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    return (p) => {
      const x = p[0] * cy + p[2] * sy, z0 = -p[0] * sy + p[2] * cy;
      const y = p[1] * cp - z0 * sp, z = p[1] * sp + z0 * cp;
      return [x * cr - y * sr, x * sr + y * cr, z];
    };
  };

  // A repeatable stream of numbers from a seed: the same line of code every frame until its seed changes.
  const stream = (seed) => { let s = (seed * 2654435761) >>> 0; return () => (s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0) >>> 9; };

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

    // The crystal. st: { t, mode, act, actA, open, look:[x,y], speed, sq, wide, dizzy, sleepy }
    // cx, cy are cells; rad the radius in cells. put(x, y, level) writes a cell, the brightest write wins.
    body(k, cx, cy, rad, st) {
      const { put, L, th } = k, t = st.t, dt = st.dt ?? 0.016;
      const v = this.level(st);
      const mode = st.mode, A = st.act;
      const sleepy = st.sleepy > 0.5, talking = mode === 'talk' || mode === 'listen';
      // Spin: slow at rest, faster thinking, a quick whirl while 'hype'; dizzy wobbles it.
      const spinRate = mode === 'think' ? 1.5 : A === 'hype' ? 3 : sleepy ? 0.08 : talking ? 0.5 : 0.3;
      st.spin = (st.spin ?? 0) + spinRate * dt;
      // How far the facets stand apart: lifted while it thinks, a pop on 'hype', a breath with the voice.
      const apart = sleepy ? 0 : mode === 'think' ? 0.2 + 0.05 * Math.sin(t * 2.6) : A === 'hype' ? 0.16 * Math.abs(Math.sin(t * 6.5)) : talking ? 0.06 + 0.05 * v : 0.055 + 0.012 * Math.sin(t * 1.4);
      st.apart = (st.apart ?? 0) + (apart - (st.apart ?? 0)) * Math.min(1, dt * 7);
      // Asleep it folds down small; awake it grows back.
      st.fold = (st.fold ?? 0) + ((sleepy ? 1 : 0) - (st.fold ?? 0)) * Math.min(1, dt * 3);
      const fold = st.fold, ex = st.apart;
      const wobble = st.dizzy > 0.5 ? Math.sin(t * 9) * 0.3 : 0;
      const shell = turner(st.spin + st.look[0] * 0.45, -0.38 + st.look[1] * 0.22 + wobble, 0.2 + Math.sin(t * 0.37) * 0.12);
      const core = turner(-st.spin * 1.7 + 0.6, 0.5 + Math.sin(t * 0.8) * 0.2 + wobble, t * 0.45);
      // Squash from the body's bounces, and a shake when it's upset.
      const sx = 1 + st.sq * 0.05, sy = 1 - st.sq * 0.04;
      const shake = A === 'upset' && st.actA % 0.9 < 0.32 ? Math.sin(t * 48) * 0.6 : 0;
      const size = rad * (1 - fold * 0.42) * (1 + (sleepy ? 0.03 : 0.012) * Math.sin(t * 1.4));
      const dim = fold > 0.5 ? 1 : 0;
      // A turned point on screen: cells, with its depth (toward the viewer is positive). A touch of perspective.
      const at = (q, r) => { const s = 1 + q[2] * 0.1; return [cx + q[0] * r * s * sx + shake, cy + q[1] * r * s * sy, q[2]]; };
      // An edge between two screen points: bright toward the viewer; the far side shows through as scattered dots.
      const edge = (a, b, boost) => {
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
        for (let i = 0; i <= n; i++) {
          const u = i / n, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + (b[2] - a[2]) * u;
          if (z < -0.12) { if (th(Math.floor(x), Math.floor(y)) < 0.42) put(x, y, 1); continue; }
          put(x, y, clamp((z > 0.45 ? 3 : 2) + boost - dim, 1, L - 1));
        }
      };
      // A facet is a pane of code: rows of short words from its first corner down to the edge across, each line with
      // its own indent, words and length. The lines travel down the pane (faster while it talks, rewriting fast
      // while it thinks), the newest one is typed out letter by letter, and now and then a word is lit.
      st.scroll = (st.scroll ?? 0) + (mode === 'think' ? 3.4 : talking ? 1.5 + v : 0.45) * dt;
      const code = (fi, a, b, c, facing, glint) => {
        const rows = Math.floor(Math.hypot((b[0] + c[0]) / 2 - a[0], (b[1] + c[1]) / 2 - a[1]) / 2);
        if (rows < 3) return;
        const scroll = st.scroll + fi * 1.37, step = Math.floor(scroll), shift = scroll - step;
        const base = facing > 0.5 ? 2 : 1, faint = facing < 0.18;
        for (let r = 0; r < rows; r++) {
          const u = (r + shift) / rows;
          if (u < 0.16 || u > 0.92) continue;
          const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u, qx = a[0] + (c[0] - a[0]) * u, qy = a[1] + (c[1] - a[1]) * u;
          const len = Math.floor(Math.hypot(qx - px, qy - py));
          if (len < 5) continue;
          const next = stream(fi * 977 + (r - step) * 131 + 7);
          // The newest line is still being typed.
          const typed = r === Math.ceil(0.16 * rows - shift) ? 2 + shift * len * 1.6 : len;
          let pos = 2 + (next() % 4);
          while (pos < len - 2 && pos < typed) {
            const word = 1 + (next() % 4), lit = next() % 7 === 0 || (talking && next() % 5 === 0 && v > 0.55);
            for (let w = 0; w < word && pos + w < len - 2 && pos + w < typed; w++) {
              const f = (pos + w) / len, x = px + (qx - px) * f, y = py + (qy - py) * f;
              if (faint && th(Math.floor(x), Math.floor(y)) > 0.55) continue;
              put(x, y, clamp(base + (lit ? 1 : 0) + glint, 1, L - 1));
            }
            pos += word + 1 + (next() % 2);
            if (next() % 5 === 0) break; // a short line
          }
          // The typing cursor: one bright cell at the end of the newest line.
          if (typed < len - 2 && facing > 0.18) { const f = Math.min(pos, typed) / len; put(px + (qx - px) * f, py + (qy - py) * f, L); }
        }
      };
      // The shell's points: the voice pushes each one out in turn, so the crystal bristles like a star as it speaks.
      const wavy = talking ? v : A === 'hype' ? 0.6 : 0;
      const reach = ICO.map((_, i) => 1 + wavy * 0.3 * Math.max(0, Math.sin(t * (mode === 'talk' ? 10 : 5) + i * 2.4)) * (0.55 + 0.45 * Math.sin(t * 3.1 + i)));
      const turned = ICO.map(shell);
      // Twenty facets, each a triangle of edges. Lifted apart, each slides out along its own normal and shrinks a
      // little, so the gaps show; together, neighbours share their edges.
      for (const FACET of ICO_F) {
        const [i, j, l, nrm] = FACET;
        const n = shell(nrm), lift = ex * 1.1, shrink = 1 - ex * 0.9;
        const corner = (m) => {
          const q = turned[m], r = reach[m];
          return at([n[0] * lift + (n[0] + (q[0] * r - n[0]) * shrink), n[1] * lift + (n[1] + (q[1] * r - n[1]) * shrink), n[2] * lift + (n[2] + (q[2] * r - n[2]) * shrink)], size);
        };
        const a = corner(i), b = corner(j), c = corner(l);
        // A facet turned toward the light (top left, toward the viewer) glints.
        const glint = n[2] > 0.2 && -n[0] * 0.5 - n[1] * 0.62 + n[2] * 0.6 > 0.78 ? 1 : 0;
        edge(a, b, glint); edge(b, c, glint); edge(c, a, glint);
        if (rad >= 13 && !dim && n[2] > -0.05) code(ICO_F.indexOf(FACET), a, b, c, n[2], glint);
      }
      // Its twelve points: lit nodes, the near ones brightest; now and then one sparkles.
      const spark = Math.floor(t * 1.3) % 12, sparkA = (t * 1.3) % 1;
      turned.forEach((q, i) => {
        if (ex > 0.1) return; // lifted apart, the facets' own corners carry the light
        const p = at([q[0] * reach[i], q[1] * reach[i], q[2] * reach[i]], size);
        if (q[2] < -0.12) { put(p[0], p[1], 1); return; }
        put(p[0], p[1], L - dim);
        if (rad >= 13 && !dim) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(p[0] + dx, p[1] + dy, q[2] > 0.4 ? 3 : 2);
        if ((i === spark || st.happy > 0.5) && sparkA < 0.35 && q[2] > 0 && !dim) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) put(p[0] + dx, p[1] + dy, L - 1);
      });
      // Finer points on the larger sizes: the edges' middles, a faint lattice inside the shell.
      if (rad >= 15 && ex < 0.1 && !dim) for (const m of MIDS) {
        const q = shell(m);
        if (q[2] > 0.1) { const p = at(q, size * 0.74); put(p[0], p[1], q[2] > 0.6 ? 2 : 1); }
      }
      // The core: a small octahedron turning the other way, swelling with the voice.
      const coreR = size * (0.44 + (talking ? v * 0.1 : 0) + (mode === 'think' ? 0.04 * Math.sin(t * 7) : 0)) * (A === 'hype' ? 1.2 : 1);
      const inner = OCT.map((p) => at(core(p), coreR));
      for (const [i, j] of OCT_E) {
        const a = inner[i], b = inner[j], n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
        for (let u = 0; u <= n; u++) {
          const f = u / n, z = a[2] + (b[2] - a[2]) * f;
          put(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, clamp((z > 0 ? L - 1 : 2) - dim, 1, L - 1));
        }
      }
      // The heart: a bright diamond that swells with the voice, follows the cursor a little, closes to a line on
      // a blink and dims to a dot asleep.
      const open = st.open;
      const hr = Math.max(1, Math.round(rad * (sleepy ? 0.07 : 0.11 + v * 0.06) * (A === 'hype' ? 1.25 : 1)));
      const hx = Math.round(cx + st.look[0] * rad * 0.16 + shake), hy = Math.round(cy + st.look[1] * rad * 0.12);
      const hh = Math.max(0, Math.round(hr * (st.wide > 0.5 ? 1.25 : Math.min(1, open))));
      for (let y = -hr - 1; y <= hr + 1; y++) for (let x = -hr - 1; x <= hr + 1; x++) {
        const d = Math.abs(x) / (hr + 0.5) + Math.abs(y) / (hh + 0.5 || 0.5);
        if (d > 1.3) continue;
        put(hx + x, hy + y, d < 0.6 ? L : d < 1 ? L - 1 : 2);
      }
      if (hh === 0) for (let x = -hr; x <= hr; x++) put(hx + x, hy, L);
      if (sleepy) return;
      // Shards in orbit: three small diamonds on tilted paths, each with a short fading trail. They close in and
      // hurry while it thinks.
      const far = mode === 'think' ? 1.22 : 1.42, pace = mode === 'think' ? 2.6 : A === 'hype' ? 3.4 : 0.9;
      st.orbit = (st.orbit ?? 0) + pace * dt;
      for (let s = 0; s < 3; s++) {
        const tilt = turner(0, 0.5 + s * 0.9, s * 2.1 + 0.4);
        for (let tr = 0; tr < 5; tr++) {
          const a = st.orbit * (1 + s * 0.13) + s * (TAU / 3) - tr * 0.11;
          const q = tilt([Math.cos(a), 0, Math.sin(a)]), p = at(q, rad * far);
          if (q[2] < -0.2 && Math.hypot(q[0], q[1]) < 0.72) continue; // behind the crystal
          if (tr) { if (tr < 3 || th(Math.floor(p[0]), Math.floor(p[1])) < 0.5) put(p[0], p[1], tr < 2 ? 2 : 1); continue; }
          put(p[0], p[1], q[2] > 0 ? L : 3);
          if (rad >= 10) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(p[0] + dx, p[1] + dy, q[2] > 0 ? 3 : 2);
        }
      }
      // Loose snippets: short words of code that leave the crystal, drift outward and fade, more of them while it
      // talks or thinks. Each has its own direction, length and moment.
      if (rad >= 13) {
        const many = mode === 'think' ? 22 : talking ? 18 : 10, life = 2.6;
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
      // Thinking: pulses of light run along the shell's edges, one after another.
      if (mode === 'think') for (let n = 0; n < 4; n++) {
        const run = t * 2.4 + n * 7.31, [i, j] = ICO_E[Math.floor(run) % ICO_E.length], f = run % 1;
        const a = turned[i], b = turned[j], q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        if (q[2] < 0) continue;
        const p = at(q, size * (1 + ex * 1.1));
        put(p[0], p[1], L); put(p[0] + 1, p[1], L - 1); put(p[0] - 1, p[1], L - 1); put(p[0], p[1] + 1, L - 1); put(p[0], p[1] - 1, L - 1);
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
