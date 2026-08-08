function buildNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 2);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineGain = null;
  let engineOsc1 = null;
  let engineOsc2 = null;
  let engineFilter = null;
  let screechGain = null;
  let windGain = null;
  let thudGain = null;

  const settings = {
    volume: 0.5,
    engine: 0.55,
    screech: 0.5,
    wind: 0.3,
    thud: 0.7
  };

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = settings.volume;
    master.connect(ctx.destination);

    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 40;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 40;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 500;
    engineFilter.Q.value = 1.2;
    const g1 = ctx.createGain();
    g1.gain.value = 0.6;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    engineOsc1.connect(g1);
    g1.connect(engineFilter);
    engineOsc2.connect(g2);
    g2.connect(engineFilter);
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc1.start();
    engineOsc2.start();

    const noise = buildNoise(ctx);
    const screechSource = ctx.createBufferSource();
    screechSource.buffer = noise;
    screechSource.loop = true;
    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 2400;
    screechFilter.Q.value = 1.5;
    screechGain = ctx.createGain();
    screechGain.gain.value = 0;
    screechSource.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(master);
    screechSource.start();

    const windSource = ctx.createBufferSource();
    windSource.buffer = noise;
    windSource.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'highpass';
    windFilter.frequency.value = 450;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    thudGain = ctx.createGain();
    thudGain.gain.value = 0;
    thudGain.connect(master);
  }

  function update(dt, state) {
    if (!ctx) return;
    const speed = Math.abs(state.speed);
    const throttle = state.throttle;
    const rpm = 850 + speed * 62 + throttle * 1200;
    const f1 = 34 + rpm / 60 * 2;
    engineOsc1.frequency.value += (f1 - engineOsc1.frequency.value) * Math.min(dt * 8, 1);
    engineOsc2.frequency.value += (f1 * 1.5 - engineOsc2.frequency.value) * Math.min(dt * 8, 1);
    engineFilter.frequency.value += (260 + rpm / 60 * 30 - engineFilter.frequency.value) * Math.min(dt * 6, 1);
    const targetEngine = (0.05 + throttle * 0.16) * settings.engine;
    engineGain.gain.value += (targetEngine - engineGain.gain.value) * Math.min(dt * 6, 1);

    const targetScreech = state.slipLevel * 0.22 * settings.screech;
    screechGain.gain.value += (targetScreech - screechGain.gain.value) * Math.min(dt * 10, 1);

    const targetWind = Math.min(0.4, speed * 0.0035) * settings.wind;
    windGain.gain.value += (targetWind - windGain.gain.value) * Math.min(dt * 4, 1);

    if (master && master.gain.value !== settings.volume) {
      master.gain.value = settings.volume;
    }
  }

  function thud(intensity) {
    if (!ctx) return;
    const strength = Math.max(0.3, Math.min(1, intensity));
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7 * strength * settings.thud, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  function addGui(gui) {
    const f = gui.addFolder('Audio');
    f.add(settings, 'volume', 0, 1, 0.01).name('volume');
    f.add(settings, 'engine', 0, 1, 0.01).name('motore');
    f.add(settings, 'screech', 0, 1, 0.01).name('gomme');
    f.add(settings, 'wind', 0, 1, 0.01).name('vento');
    f.add(settings, 'thud', 0, 1, 0.01).name('impatti');
    return f;
  }

  return { start: ensure, update, thud, addGui };
}
