// All sound is synthesised with WebAudio: no audio files, no network.
// The engine is a sawtooth whose pitch follows the car's speed, the
// siren is two alternating tones while the player is wanted, gunshots
// are filtered noise bursts, and the music is a quiet bass-and-hat loop
// scheduled a bar ahead. Nothing here creates an AudioContext until the
// player first interacts, so the page loads silently in a headless run.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let nextBarTime = 0;
  let bar = 0;
  let muted = false;

  // A short bass line in A minor; the music walks it forever.
  const BASS_LINE = [55, 0, 55, 65.41, 49, 0, 55, 82.41];
  const BAR_SECONDS = 1.9;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 700;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch (error) {
      ctx = null;
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function scheduleBar() {
    if (!ctx) return;
    const start = Math.max(ctx.currentTime + 0.05, nextBarTime);
    BASS_LINE.forEach((freq, i) => {
      if (!freq) return;
      const t = start + (i * BAR_SECONDS) / BASS_LINE.length;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.25);
    });
    // A soft hat on every eighth.
    for (let i = 0; i < 8; i += 1) {
      const t = start + (i * BAR_SECONDS) / 8;
      const noise = noiseBurst(t, 0.03, 0.02, 6000);
      if (noise) noise.connect(master);
    }
    nextBarTime = start + BAR_SECONDS;
    bar += 1;
  }

  function noiseBurst(when, duration, volume, filterFreq) {
    if (!ctx) return null;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    source.start(when);
    return gain;
  }

  return {
    resume,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    // Called every frame with the live state: the engine follows the
    // car, the siren follows the wanted level, the music keeps time.
    update({ speed, wantedStars, playing }) {
      if (!ctx) return;
      if (!playing) {
        if (engineGain) engineGain.gain.value = 0;
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      if (engineOsc && engineGain) {
        engineOsc.frequency.value = 55 + Math.abs(speed) * 0.22;
        engineGain.gain.value = speed !== 0 ? 0.05 : 0.015;
      }
      if (sirenOsc && sirenGain) {
        sirenGain.gain.value = wantedStars > 0 ? 0.045 : 0;
        if (wantedStars > 0) {
          const now = ctx.currentTime;
          sirenOsc.frequency.setValueAtTime(700, now);
          sirenOsc.frequency.linearRampToValueAtTime(950, now + 0.4);
          sirenOsc.frequency.linearRampToValueAtTime(700, now + 0.8);
        }
      }
      if (!musicTimer) {
        nextBarTime = ctx.currentTime + 0.1;
        musicTimer = window.setInterval(scheduleBar, BAR_SECONDS * 1000 * 0.9);
      }
    },
    gunshot() {
      if (!ensure()) return;
      resume();
      noiseBurst(ctx.currentTime, 0.14, 0.5, 1800);
    },
    enemyShot() {
      if (!ensure()) return;
      noiseBurst(ctx.currentTime, 0.1, 0.18, 1200);
    },
    crash() {
      if (!ensure()) return;
      noiseBurst(ctx.currentTime, 0.25, 0.4, 300);
    },
    pickup() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t + i * 0.09);
        gain.gain.linearRampToValueAtTime(0.15, t + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.18);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.2);
      });
    },
    missionComplete() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t + i * 0.11);
        gain.gain.linearRampToValueAtTime(0.18, t + i * 0.11 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.3);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t + i * 0.11);
        osc.stop(t + i * 0.11 + 0.32);
      });
    },
    horn() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 370;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
    },
  };
}
