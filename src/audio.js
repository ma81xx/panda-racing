export function createAudio() {
  let ctx = null;
  let enabled = true;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let screechGain = null;
  let rumbleGain = null;

  function build() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ctx = null;
      return;
    }

    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
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
  }

  function resume() {
    if (!enabled) return;
    if (!ctx) build();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function update(state) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const speed = Math.min(Math.abs(state.speed || 0), 35);
    const throttle = Math.max(state.speed || 0, 0) > 0.5 ? 1 : 0;

    if (engineOsc && engineGain) {
      engineOsc.frequency.setTargetAtTime(55 + speed * 4, t, 0.05);
      const engineVol = 0.012 + (throttle ? 0.05 + Math.min(speed, 30) * 0.0012 : 0);
      engineGain.gain.setTargetAtTime(engineVol, t, 0.06);
    }
    if (screechGain) {
      const slip = Math.min(state.slipAmount || 0, 1);
      screechGain.gain.setTargetAtTime(slip * 0.11, t, 0.05);
    }
    if (rumbleGain) {
      rumbleGain.gain.setTargetAtTime(state.offRoad ? 0.06 : 0, t, 0.05);
    }
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
    }
  }

  return { resume, update, impact, setEnabled };
}
