export function createAudio() {
  let ctx = null;
  let enabled = true;
  let engineReal = true;
  let idleBuf = null;
  let ignitionBuf = null;
  let sampleReady = false;
  let pendingIgnition = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sampleSource = null;
  let sampleGain = null;
  let screechGain = null;
  let rumbleGain = null;
  let noiseBuffer = null;
  let lastGear = 0;
  let runningStartAt = 0;

  const IDLE_BASE_RPM = 873;
  const SAMPLE_MAX_RATE = 2.6;
  const OSC_FADE_LO = 2400;
  const OSC_FADE_HI = 4200;
  const ENGINE_GAIN_IDLE = 0.65;
  const IGNITION_GAIN = 0.5;

  function smoothstep(a, b, x) {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  }

  function loadSample(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.arrayBuffer();
    }).then((buf) => ctx.decodeAudioData(buf)).catch(() => null);
  }

  function loadSamples() {
    if (!ctx || sampleReady) return;
    const ts = Date.now();
    return Promise.all([
      loadSample('audio/panda_idle_loop.wav?t=' + ts),
      loadSample('audio/ignition.wav?t=' + ts)
    ]).then(([idle, ign]) => {
      if (!ctx) return;
      idleBuf = idle;
      ignitionBuf = ign;
      sampleReady = true;
      if (engineReal && enabled && pendingIgnition) playIgnition();
    });
  }

  function build() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ctx = null;
      return;
    }

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 70;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 520;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
    engineOsc.start();

    sampleGain = ctx.createGain();
    sampleGain.gain.value = 0;
    sampleGain.connect(ctx.destination);

    const screechSource = ctx.createBufferSource();
    screechSource.buffer = noiseBuffer;
    screechSource.loop = true;
    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 1600;
    screechFilter.Q.value = 1.2;
    screechGain = ctx.createGain();
    screechGain.gain.value = 0;
    screechSource.connect(screechFilter).connect(screechGain).connect(ctx.destination);
    screechSource.start();

    const rumbleSource = ctx.createBufferSource();
    rumbleSource.buffer = noiseBuffer;
    rumbleSource.loop = true;
    rumbleSource.playbackRate.value = 0.6;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 150;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleSource.connect(rumbleFilter).connect(rumbleGain).connect(ctx.destination);
    rumbleSource.start();

    loadSamples();
  }

  function startEngine() {
    if (!ctx || !idleBuf || sampleSource) return;
    sampleSource = ctx.createBufferSource();
    sampleSource.buffer = idleBuf;
    sampleSource.loop = true;
    sampleSource.connect(sampleGain);
    sampleSource.start();
  }

  function resume() {
    if (!enabled) return;
    if (!ctx) build();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function playIgnition() {
    if (!ctx || !enabled || !engineReal) return;
    if (!sampleReady) {
      pendingIgnition = true;
      loadSamples();
      return;
    }
    pendingIgnition = false;
    const t = ctx.currentTime;
    startEngine();
    if (ignitionBuf) {
      const src = ctx.createBufferSource();
      src.buffer = ignitionBuf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(IGNITION_GAIN, t + 0.03);
      g.gain.setValueAtTime(IGNITION_GAIN, t + ignitionBuf.duration - 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ignitionBuf.duration);
      src.connect(g).connect(ctx.destination);
      src.start(t);
      src.stop(t + ignitionBuf.duration + 0.05);
      runningStartAt = t + ignitionBuf.duration;
    } else {
      runningStartAt = t;
    }
  }

  function update(state) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const redline = state.redline || 7200;
    const rpm = Math.max(0, Math.min(state.rpm || 900, redline));
    const rpmNorm = Math.min(Math.max((rpm - 900) / Math.max(redline - 900, 1), 0), 1);

    const running = engineReal && enabled && t >= runningStartAt;
    const oscMix = engineReal ? smoothstep(OSC_FADE_LO, OSC_FADE_HI, rpm) : 1;

    if (engineOsc && engineGain && engineFilter) {
      engineOsc.frequency.setTargetAtTime(rpm / 30, t, 0.03);
      engineFilter.frequency.setTargetAtTime(420 + rpmNorm * 1800, t, 0.05);
      const engineVol = 0.015 + rpmNorm * 0.06;
      engineGain.gain.setTargetAtTime(engineVol * oscMix, t, 0.06);
    }
    if (sampleSource && sampleGain) {
      const rate = Math.min(Math.max(rpm / IDLE_BASE_RPM, 0.9), SAMPLE_MAX_RATE);
      sampleSource.playbackRate.setTargetAtTime(rate, t, 0.02);
      const target = running ? ENGINE_GAIN_IDLE * (1 - oscMix) : 0;
      sampleGain.gain.setTargetAtTime(target, t, running ? 0.08 : 0.02);
    }
    if (screechGain) {
      const slip = Math.min(state.slipAmount || 0, 1);
      screechGain.gain.setTargetAtTime(slip * 0.11, t, 0.05);
    }
    if (rumbleGain) {
      rumbleGain.gain.setTargetAtTime(state.offRoad ? 0.06 : 0, t, 0.05);
    }

    const gear = state.gear || 0;
    if (gear !== lastGear) {
      lastGear = gear;
      if (gear !== 0) shiftBlip();
    }
  }

  function shiftBlip() {
    if (!ctx || !noiseBuffer) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 850;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.1);
  }

  function impact(intensity) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(Math.min(intensity, 1) * 0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  function setEnabled(value) {
    enabled = value;
    if (!value && ctx) {
      try { ctx.close(); } catch (e) { /* ignore */ }
      ctx = null;
      sampleSource = null;
    }
  }

  function setEngineReal(value) {
    engineReal = value;
    if (!ctx || !enabled) return;
    if (value) {
      if (sampleReady) {
        startEngine();
        runningStartAt = Math.max(runningStartAt, ctx.currentTime);
      } else {
        loadSamples();
      }
    }
  }

  return { resume, update, impact, setEnabled, setEngineReal, playIgnition };
}
