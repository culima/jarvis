// The overlay: one transparent canvas over the whole screen, with Jarvis on it.
// - Cells: the body is drawn in square cells of light (four levels of brightness of one colour).
// - State: idle, listening, thinking or speaking, set by the main process; the voice's loudness comes with it.
// - Place: where he stands is worked out from the screen's layout (place.js); he gets there by a dash or a phase.
// The main process talks to this page through window.bridge (preload.js); without one (a browser, for testing) the
// page runs by itself, and ?demo cycles through his states.
(() => {
  const J = window.Jarvis, canvas = document.getElementById('stage'), ctx = canvas.getContext('2d');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const q = new URLSearchParams(location.search);

  // ---- settings (from the main process) -------------------------------------------------------------------
  const SIZES = { small: 60, medium: 110, large: 170, huge: 250 };
  const cfg = { colour: '#a06bff', size: 'huge', ...(q.get('size') ? { size: q.get('size') } : {}), ...(q.get('colour') ? { colour: '#' + q.get('colour') } : {}) };
  let palette = [];
  const shade = (hex, k, a = 1) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(k <= 1 ? c * k : c + (255 - c) * (k - 1));
    return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
  };
  const setColour = (hex) => { if (/^#[0-9a-f]{6}$/i.test(hex)) cfg.colour = hex; palette = [null, shade(cfg.colour, 0.42), shade(cfg.colour, 0.78), shade(cfg.colour, 1.25), shade(cfg.colour, 1.82)]; };
  setColour(cfg.colour);

  // ---- the stage ------------------------------------------------------------------------------------------
  let W = 0, H = 0, dpr = 1, P = 4;
  const fit = () => {
    dpr = window.devicePixelRatio || 1; W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  addEventListener('resize', fit); fit();

  // ---- Jarvis ---------------------------------------------------------------------------------------------
  // me: where he is. st: what the body is drawn from. hop: a move under way.
  const me = { x: W * 0.78, y: H * 0.7, shown: 1 };
  const st = { t: 0, dt: 1 / 60, mode: null, voice: null, heard: null, act: null, open: 1, look: [0, 0], sq: 0, wide: 0, dizzy: 0, happy: 0, sleepy: 0, fx: null, scan: 9 };
  const radius = () => SIZES[cfg.size] ?? SIZES.huge;
  let hop = null, scanAt = -1e9, appearAt = performance.now();
  const moveTo = (x, y) => {
    const d = Math.hypot(x - me.x, y - me.y);
    if (d < radius() * 0.35 || hop) return;
    const phase = Math.random() < (d > radius() * 5 ? 0.7 : 0.25);
    hop = { phase, x0: me.x, y0: me.y, x1: x, y1: y, d, t: 0, dur: phase ? 0.85 : clamp(0.42 + d / (radius() * 24), 0.5, 0.85) };
  };
  const stepHop = (dt) => {
    if (!hop) return;
    hop.t += dt;
    const u = clamp(hop.t / hop.dur, 0, 1);
    if (hop.phase) {
      const cut = 0.42;
      if (u >= cut) { me.x = hop.x1; me.y = hop.y1; }
      st.fx = { gone: u < cut ? Math.pow(u / cut, 0.8) : Math.pow(1 - (u - cut) / (1 - cut), 1.4) };
    } else {
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2, s = Math.sin(u * Math.PI) * Math.min(2.6, 0.8 + hop.d / (radius() * 3));
      me.x = hop.x0 + (hop.x1 - hop.x0) * e; me.y = hop.y0 + (hop.y1 - hop.y0) * e;
      st.fx = { streak: [(-(hop.x1 - hop.x0) / hop.d) * s, (-(hop.y1 - hop.y0) / hop.d) * s] };
    }
    if (u >= 1) { me.x = hop.x1; me.y = hop.y1; hop = null; st.fx = null; }
  };

  // ---- where to stand ---------------------------------------------------------------------------------------
  const P_ = J.place, roam = { rev: -1, at: 0, hold: 0 };
  let safe = { l: 0, t: 0, r: 0, b: 0 }, cursor = null, avoid = [], target = null;
  const screen = () => ({ l: safe.l, t: safe.t, r: W - safe.r, b: H - safe.b });
  const placeNow = (now, force) => {
    const settled = performance.now() - (P_.changedAt ?? 0) > 280;
    const changed = (P_.rev !== roam.rev && settled) || force, idle = now > roam.at && !st.mode;
    if (!(changed || idle) || now < roam.hold || hop) return;
    if (changed) scanAt = performance.now();
    roam.rev = P_.rev; roam.at = now + 16 + Math.random() * 28; roam.hold = now + 0.9;
    const rad = radius() * 1.3, here = [me.x, me.y];
    const r = P_.best({ screen: screen(), windows: P_.windows, grid: P_.grid, rad, cursor, here, avoid, target });
    let go = r.here == null || r.score < r.here - 0.12 ? r : null;
    if (!go && idle && !changed && Math.random() < 0.55) go = [r, ...r.others].find((c) => Math.hypot(c.x - here[0], c.y - here[1]) > rad * 2 && c.score < r.here + 0.1) ?? null;
    if (go && go.score < 50) moveTo(go.x, go.y);
  };

  // ---- drawing ----------------------------------------------------------------------------------------------
  const th = (x, y) => (((x * 7 + y * 13) % 17) + 17) % 17 / 17;
  let cells = new Map();
  const put = (x, y, l) => {
    x = Math.round(x); y = Math.round(y);
    const k = (y << 12) ^ (x & 4095) ^ ((x < 0 ? 1 : 0) << 30), old = cells.get(k);
    if (!old || old[2] < l) cells.set(k, [x, y, l]);
  };
  let dirty = null;
  const draw = () => {
    if (dirty) ctx.clearRect(dirty[0] - 8, dirty[1] - 8, dirty[2] + 16, dirty[3] + 16);
    cells = new Map();
    if (me.shown <= 0) { dirty = null; return; }
    const rad = radius();
    P = rad >= 200 ? 4.4 : rad >= 140 ? 4.2 : rad >= 90 ? 4 : 3.4;
    J.body.draw({ put, L: 4, th }, me.x / P, me.y / P, rad / P / 1.0 * 0.98, st);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const s = P - 1;
    for (let l = 1; l <= 4; l++) {
      ctx.fillStyle = palette[l];
      ctx.shadowColor = l >= 3 ? shade(cfg.colour, 1, 0.9) : 'transparent'; ctx.shadowBlur = l >= 3 ? P * 1.6 : 0;
      ctx.beginPath();
      for (const [x, y, lv] of cells.values()) {
        if (lv !== l) continue;
        const px = x * P, py = y * P;
        ctx.rect(px, py, s, s);
        if (px < x0) x0 = px; if (py < y0) y0 = py; if (px > x1) x1 = px; if (py > y1) y1 = py;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    dirty = x1 >= x0 ? [x0, y0, x1 - x0 + P, y1 - y0 + P] : null;
  };

  // ---- the loop ---------------------------------------------------------------------------------------------
  let last = performance.now(), now = 0;
  const demo = q.has('demo') ? ['', 'listen', 'think', 'talk'] : null;
  const frame = (ts) => {
    const dt = clamp((ts - last) / 1000, 0, 0.05); last = ts; now += dt;
    st.t = now; st.dt = dt; st.scan = (performance.now() - scanAt) / 1000;
    if (demo) {
      st.mode = demo[Math.floor(now / 4) % demo.length] || null;
      st.heard = st.mode === 'listen' ? Math.abs(Math.sin(now * 3)) * 0.8 : null;
      st.voice = st.mode === 'talk' ? Math.max(0, Math.sin(now * 7) * Math.sin(now * 1.3 + 1)) * 0.5 : null;
    }
    // Appearing: he comes together from his fragments.
    const born = (performance.now() - appearAt) / 900;
    stepHop(dt);
    if (!hop && born < 1) st.fx = { gone: Math.pow(1 - born, 1.5) }; else if (!hop) st.fx = null;
    placeNow(now, false);
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---- the bridge -------------------------------------------------------------------------------------------
  // Messages from the main process: { kind, ... }.
  const on = {
    config: (m) => { if (m.colour) setColour(m.colour); if (m.size && SIZES[m.size]) cfg.size = m.size; roam.hold = 0; placeNow(now, true); },
    layout: (m) => { P_.feed(m.windows, null, m.grid ?? null); if (m.safe) safe = m.safe; },
    cursor: (m) => { cursor = m.at ?? null; },
    state: (m) => { st.mode = m.mode ?? null; if (m.mode !== 'talk') st.voice = null; if (m.mode !== 'listen') st.heard = null; },
    level: (m) => { if (st.mode === 'talk') st.voice = m.v; else if (st.mode === 'listen') st.heard = m.v; },
    show: (m) => { me.shown = m.on === false ? 0 : 1; if (me.shown) appearAt = performance.now(); },
    target: (m) => { target = m.rect ?? null; roam.hold = 0; placeNow(now, true); },
  };
  window.Jarvis.receive = (m) => on[m?.kind]?.(m);
  window.bridge?.onMessage?.((m) => window.Jarvis.receive(m));
  window.bridge?.ready?.();
})();
