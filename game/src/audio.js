// All sound is synthesised with WebAudio: no audio files, no network. The
// engine is a detuned sawtooth whose pitch follows speed, the siren is two
// alternating tones, gunshots are noise bursts, and a small bass-and-hat loop
// plays a sun-soaked groove. Everything is guarded: in a headless browser
// (screenshots) the context may stay suspended, and the game plays on.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;
  let musicOn = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  /** Call from the first user gesture; browsers need one before sound plays. */
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function noiseBuffer(seconds) {
    const c = ensure();
    if (!c) return null;
    const buffer = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function blip(freq, seconds, type, volume, slideTo) {
    const c = ensure();
    if (!c || !master) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + seconds);
      gain.gain.setValueAtTime(volume || 0.2, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(c.currentTime + seconds + 0.02);
    } catch {
      // Sound is garnish; never let it break the game.
    }
  }

  function noiseHit(seconds, volume, filterFreq) {
    const c = ensure();
    if (!c || !master) return;
    try {
      const buffer = noiseBuffer(seconds);
      if (!buffer) return;
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = c.createGain();
      gain.gain.setValueAtTime(volume || 0.3, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + seconds);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch {
      // See above.
    }
  }

  const api = {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shot() {
      noiseHit(0.12, 0.5, 2600);
      blip(160, 0.08, 'square', 0.18, 60);
    },
    enemyShot() {
      noiseHit(0.1, 0.22, 1800);
    },
    hit() {
      blip(220, 0.07, 'triangle', 0.25, 110);
    },
    horn() {
      blip(370, 0.16, 'square', 0.12, 370);
      blip(466, 0.16, 'square', 0.1, 466);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.25);
      setTimeout(() => blip(990, 0.12, 'sine', 0.25), 70);
    },
    cash() {
      blip(880, 0.08, 'sine', 0.22);
      setTimeout(() => blip(1174, 0.1, 'sine', 0.22), 60);
      setTimeout(() => blip(1568, 0.14, 'sine', 0.22), 120);
    },
    crash() {
      noiseHit(0.3, 0.5, 500);
    },
    explosion() {
      noiseHit(0.8, 0.7, 300);
      blip(90, 0.6, 'sine', 0.4, 30);
    },
    siren(on) {
      const c = ensure();
      if (!c || !master) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = c.createOscillator();
          sirenGain = c.createGain();
          sirenOsc.type = 'triangle';
          sirenOsc.frequency.value = 700;
          sirenGain.gain.value = 0.05;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          const lfo = c.createOscillator();
          const lfoGain = c.createGain();
          lfo.frequency.value = 0.9;
          lfoGain.gain.value = 220;
          lfo.connect(lfoGain);
          lfoGain.connect(sirenOsc.frequency);
          lfo.start();
          sirenOsc._lfo = lfo;
        } else if (!on && sirenOsc) {
          const osc = sirenOsc;
          const lfo = osc._lfo;
          sirenOsc = null;
          sirenGain = null;
          osc.stop();
          if (lfo) lfo.stop();
        }
      } catch {
        sirenOsc = null;
      }
    },
    engine(on, speedRatio) {
      const c = ensure();
      if (!c || !master) return;
      try {
        if (on && !engineOsc) {
          engineOsc = c.createOscillator();
          engineGain = c.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.value = 70;
          engineGain.gain.value = 0.04;
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 700;
          engineOsc.connect(filter);
          filter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        } else if (!on && engineOsc) {
          const osc = engineOsc;
          engineOsc = null;
          engineGain = null;
          osc.stop();
        }
        if (engineOsc && typeof speedRatio === 'number') {
          engineOsc.frequency.setTargetAtTime(60 + speedRatio * 160, c.currentTime, 0.08);
          if (engineGain) engineGain.gain.setTargetAtTime(0.03 + speedRatio * 0.05, c.currentTime, 0.1);
        }
      } catch {
        engineOsc = null;
      }
    },
    missionComplete() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.25), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sawtooth', 0.15), i * 160));
    },
    startMusic() {
      const c = ensure();
      if (!c || musicOn) return;
      musicOn = true;
      // A 16-step loop at 112 BPM: a warm bassline with a hat tick.
      const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 73.4, 0];
      const stepMs = 60000 / 112 / 4;
      musicTimer = window.setInterval(() => {
        if (muted || !master) {
          musicStep = (musicStep + 1) % 16;
          return;
        }
        const note = bass[musicStep];
        if (note) blip(note, 0.22, 'triangle', 0.16);
        if (musicStep % 2 === 0) noiseHit(0.03, 0.05, 6000);
        musicStep = (musicStep + 1) % 16;
      }, stepMs);
    },
    stopMusic() {
      if (musicTimer) window.clearInterval(musicTimer);
      musicTimer = null;
      musicOn = false;
    },
  };
  return api;
}
