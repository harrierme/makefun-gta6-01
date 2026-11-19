// Synthesised sound: no audio files, no network. Everything is WebAudio
// oscillators and filtered noise, started on the first user gesture (the
// browser will not let audio run before one).

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let musicTimer = null;
  let musicStep = 0;

  // A laid-back bass line over a simple drum feel, in A minor.
  const BASS_LINE = [55, 0, 55, 65.41, 0, 55, 49, 0, 55, 0, 82.41, 0, 73.42, 65.41, 49, 0];
  const STEP_SECONDS = 0.22;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(frequency, seconds, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, context.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + seconds);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(context.currentTime + seconds + 0.02);
  }

  function noiseBurst(seconds, filterFrequency, volume) {
    if (!ensure() || muted) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(seconds);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = context.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 740;
    sirenGain = context.createGain();
    sirenGain.gain.value = 0.05;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    let high = false;
    sirenTimer = window.setInterval(() => {
      if (!sirenOsc) return;
      high = !high;
      sirenOsc.frequency.setValueAtTime(high ? 740 : 560, context.currentTime);
    }, 420);
  }

  function stopSiren() {
    if (sirenTimer !== null) {
      window.clearInterval(sirenTimer);
      sirenTimer = null;
    }
    if (sirenOsc) {
      try { sirenOsc.stop(); } catch { /* already stopped */ }
      sirenOsc = null;
      sirenGain = null;
    }
  }

  function musicTick() {
    if (!context || muted) return;
    const note = BASS_LINE[musicStep % BASS_LINE.length];
    const isHat = musicStep % 2 === 1;
    if (note > 0) blip(note, STEP_SECONDS * 1.8, 'triangle', 0.16);
    if (isHat) noiseBurst(0.04, 6000, 0.05);
    if (musicStep % 8 === 0) noiseBurst(0.12, 300, 0.22); // soft kick
    musicStep += 1;
  }

  function startMusic() {
    if (!ensure() || musicTimer !== null) return;
    musicTimer = window.setInterval(musicTick, STEP_SECONDS * 1000);
  }

  function stopMusic() {
    if (musicTimer !== null) {
      window.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  return {
    /** Call from the first gesture so the browser unlocks audio. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
      startEngine();
      startMusic();
    },
    /** Engine hum follows speed 0..1; silent on foot. */
    setEngine(speed01, on) {
      if (!engineGain || !engineOsc) return;
      const target = on && !muted ? 0.045 + speed01 * 0.075 : 0;
      engineGain.gain.setTargetAtTime(target, context.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, context.currentTime, 0.1);
    },
    setSiren(on) {
      if (on) startSiren();
      else stopSiren();
    },
    gunshot() { noiseBurst(0.14, 1800, 0.5); blip(160, 0.09, 'square', 0.2, 60); },
    enemyShot() { noiseBurst(0.12, 1200, 0.22); },
    crash(strength01) { noiseBurst(0.25, 500, 0.2 + strength01 * 0.4); blip(90, 0.2, 'sine', 0.3, 40); },
    reload() { blip(500, 0.06, 'square', 0.12); window.setTimeout(() => blip(700, 0.06, 'square', 0.12), 160); },
    pickup() { blip(660, 0.09, 'sine', 0.2); window.setTimeout(() => blip(990, 0.14, 'sine', 0.2), 90); },
    missionDone() {
      [523, 659, 784, 1047].forEach((frequency, i) => {
        window.setTimeout(() => blip(frequency, 0.22, 'triangle', 0.22), i * 130);
      });
    },
    busted() { blip(220, 0.5, 'sawtooth', 0.25, 110); },
    wasted() { blip(180, 0.8, 'sawtooth', 0.25, 55); },
    click() { blip(800, 0.05, 'square', 0.1); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      if (muted) stopSiren();
      return muted;
    },
    get isMuted() { return muted; },
  };
}
