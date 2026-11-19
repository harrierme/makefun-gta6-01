// All sound is synthesised with WebAudio: no audio files, no network.
// The AudioContext is created lazily on the first user interaction so
// headless runs stay silent.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let bassTimer = null;
  let muted = false;
  let bassStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: sawtooth whose pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: two alternating tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      // Slow bass loop, one quiet note every half second.
      const bassNotes = [55, 55, 65.4, 49];
      bassTimer = window.setInterval(() => {
        if (!ctx || muted) return;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = bassNotes[bassStep % bassNotes.length];
        bassStep += 1;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.10, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(g);
        g.connect(master);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      }, 500);
      return true;
    } catch (err) {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function noiseBurst(duration, volume, filterFreq) {
    if (!ensure()) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  function blip(freq, duration, volume, type) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    resume,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    update(state) {
      if (!ctx) return;
      const speed = state.speed || 0;
      if (engineGain) engineGain.gain.value = state.playing && speed > 20 ? 0.05 + Math.min(0.06, speed / 9000) : 0;
      if (engineOsc) engineOsc.frequency.value = 50 + speed * 0.22;
      if (sirenGain) {
        sirenGain.gain.value = state.playing && state.wantedStars > 0 ? 0.045 : 0;
        if (sirenOsc && state.wantedStars > 0) {
          sirenOsc.frequency.value = Math.floor(performance.now() / 450) % 2 === 0 ? 700 : 950;
        }
      }
    },
    gunshot() {
      noiseBurst(0.12, 0.5, 3000);
    },
    enemyShot() {
      noiseBurst(0.1, 0.25, 1800);
    },
    crash() {
      noiseBurst(0.25, 0.55, 900);
    },
    pickup() {
      blip(880, 0.12, 0.3, 'sine');
      window.setTimeout(() => blip(1320, 0.16, 0.3, 'sine'), 90);
    },
    missionComplete() {
      blip(523, 0.14, 0.35, 'triangle');
      window.setTimeout(() => blip(659, 0.14, 0.35, 'triangle'), 120);
      window.setTimeout(() => blip(784, 0.24, 0.35, 'triangle'), 240);
    },
    horn() {
      blip(370, 0.25, 0.3, 'square');
    },
    siren() {},
  };
}
