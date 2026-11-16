// Jarvis' voice and ears.
// Speaking: each sentence of a reply is spoken with a Windows voice as it arrives. He keeps thinking until the first
// one is actually heard, speaks until the last one has ended, and then rests. The globe opens with each word.
// Listening: on the shortcut he opens the microphone, shows what he hears, and stops by himself when you stop talking;
// the recording goes to the main process to be turned into text. Nothing is recorded at any other time.
(() => {
  const J = window.Jarvis, st = J.state, on = J.handlers, synth = window.speechSynthesis;
  let cfg = { voiceName: '', voiceRate: 1 };
  const baseConfig = on.config;
  on.config = (m) => { baseConfig(m); cfg = { ...cfg, ...m }; };

  // ---- speaking ---------------------------------------------------------------------------------------------
  let turn = -1, waiting = 0, ended = false, sounding = false, pulse = 0;
  const rest = () => { if (waiting === 0 && ended) { sounding = false; st.mode = null; st.voice = null; } };
  on.reply = (m) => {
    if (m.begin) { synth?.cancel(); stopMic(false); turn = m.id; waiting = 0; ended = false; sounding = false; st.mode = 'think'; return; }
    if (m.id !== turn) return;
    if (m.text && synth) {
      const u = new SpeechSynthesisUtterance(m.text), id = m.id;
      const v = synth.getVoices().find((x) => x.name === cfg.voiceName);
      if (v) u.voice = v;
      u.rate = cfg.voiceRate || 1;
      waiting++;
      u.onstart = () => { if (id !== turn) return; sounding = true; st.mode = 'talk'; pulse = 1; };
      u.onboundary = () => { if (id === turn) pulse = 1; };
      u.onend = u.onerror = () => { if (id !== turn) return; waiting--; rest(); };
      synth.speak(u);
    }
    if (m.end) { ended = true; rest(); }
  };
  on.stop = () => { turn = -1; synth?.cancel(); stopMic(false); sounding = false; st.mode = null; st.voice = null; };
  // The voice's level, from the words as they're spoken: up on each word, falling between them.
  setInterval(() => {
    if (!sounding || st.mode !== 'talk') return;
    pulse *= 0.84;
    st.voice = Math.min(1, 0.1 + pulse * 0.55 + 0.08 * Math.abs(Math.sin(performance.now() / 95)));
  }, 33);

  // ---- listening --------------------------------------------------------------------------------------------
  let mic = null;
  function stopMic(send) { mic?.done(send); }
  on.listen = async () => {
    if (mic) return stopMic(true); // the shortcut again: that's all, send it
    synth?.cancel(); turn = -1; sounding = false;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { st.mode = null; return; }
    const ac = new AudioContext(), an = ac.createAnalyser(), buf = new Float32Array(1024), chunks = [];
    an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an);
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    let spoke = false, quiet = 0, floor = 0.008, over = false;
    const t0 = performance.now();
    st.mode = 'listen'; st.heard = 0;
    const timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length), loud = rms > Math.max(0.018, floor * 3.2), el = performance.now() - t0;
      st.heard = Math.min(1, rms * 7);
      if (!loud) floor += (rms - floor) * 0.05;
      if (loud) { spoke = true; quiet = 0; } else quiet += 50;
      // Done when they've spoken and gone quiet; given up when nothing was said; never longer than a minute.
      if ((spoke && quiet > 1100) || (!spoke && el > 7000) || el > 60000) done(spoke);
    }, 50);
    function done(send) {
      if (over) return;
      over = true; clearInterval(timer);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); ac.close(); mic = null; st.heard = null;
        if (!send || !chunks.length) { if (st.mode === 'listen') st.mode = null; return; }
        st.mode = 'think';
        const blob = new Blob(chunks, { type: rec.mimeType });
        window.bridge?.send({ kind: 'audio', bytes: await blob.arrayBuffer(), mime: rec.mimeType });
      };
      try { rec.stop(); } catch { rec.onstop(); }
    }
    mic = { done };
    rec.start();
  };
  window.bridge?.ready?.();
})();
