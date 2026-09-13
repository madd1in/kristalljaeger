// Musik, Soundeffekte und Sprachansagen.
// Bevorzugt WebAudio (geringe Latenz, mehrstimmig); unter file:// fällt fetch aus, dann <audio>.

const MUSIC_VOLUME = 0.42;

export class AudioManager {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = Ctx ? new Ctx() : null;
    this.buffers = new Map();
    this.elements = new Map();
    this.musicOn = true;
    this.sfxOn = true;
    this.muted = false;
    this.duck = 1;
    this.pauseDuck = 1;
    this.currentVoice = null;
    this.musicSource = null;
    this.musicElement = null;

    if (this.ctx) {
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_VOLUME;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.connect(this.master);
    }
  }

  async load(name, url) {
    if (this.ctx) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        this.buffers.set(name, await this.ctx.decodeAudioData(data));
        return;
      } catch {
        // file:// oder Decoder-Problem – auf <audio> ausweichen
      }
    }
    const el = new Audio(url);
    el.preload = 'auto';
    await new Promise((resolve) => {
      el.addEventListener('canplaythrough', resolve, { once: true });
      el.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 4000); // iOS lädt <audio> erst nach einer Geste
    });
    this.elements.set(name, el);
  }

  unlock() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(name, { volume = 1, rate = 1 } = {}) {
    if (!this.sfxOn || this.muted) return;
    const buffer = this.buffers.get(name);
    if (buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.sfxGain);
      src.start();
      return;
    }
    const el = this.elements.get(name);
    if (el) {
      const copy = el.cloneNode();
      copy.volume = Math.min(1, volume);
      copy.playbackRate = rate;
      copy.play().catch(() => {});
    }
  }

  voice(name) {
    if (this.muted) return;
    this.stopVoice();
    const buffer = this.buffers.get(name);
    let handle = null;
    if (buffer) {
      handle = this.ctx.createBufferSource();
      handle.buffer = buffer;
      handle.connect(this.voiceGain);
      handle.start();
    } else if (this.elements.has(name)) {
      handle = this.elements.get(name);
      handle.currentTime = 0;
      handle.play().catch(() => {});
    }
    if (!handle) return;
    handle.onended = () => {
      if (this.currentVoice !== handle) return;
      this.currentVoice = null;
      this.setDuck(1);
    };
    this.currentVoice = handle;
    this.setDuck(0.35);
  }

  stopVoice() {
    const v = this.currentVoice;
    if (!v) return;
    this.currentVoice = null;
    if (typeof v.stop === 'function') {
      try { v.stop(); } catch { /* schon beendet */ }
    } else {
      v.pause();
    }
    this.setDuck(1);
  }

  startMusic() {
    if (this.musicSource || this.musicElement) return;
    const buffer = this.buffers.get('bgm');
    if (buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const { start, end } = trimSilence(buffer);
      src.loopStart = start;
      src.loopEnd = end;
      src.connect(this.musicGain);
      src.start(0, start);
      this.musicSource = src;
    } else if (this.elements.has('bgm')) {
      this.musicElement = this.elements.get('bgm');
      this.musicElement.loop = true;
      this.musicElement.play().catch(() => {});
    }
    this.applyMusicVolume();
  }

  setDuck(factor) {
    this.duck = factor;
    this.applyMusicVolume();
  }

  setPaused(paused) {
    this.pauseDuck = paused ? 0.4 : 1;
    this.applyMusicVolume();
  }

  applyMusicVolume() {
    const v = this.musicOn && !this.muted ? MUSIC_VOLUME * this.duck * this.pauseDuck : 0;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
    if (this.musicElement) this.musicElement.volume = v;
  }

  setMusicOn(on) {
    this.musicOn = on;
    this.applyMusicVolume();
  }

  setSfxOn(on) {
    this.sfxOn = on;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
    if (muted) this.stopVoice();
    this.applyMusicVolume();
  }
}

// Stille am Anfang/Ende finden, damit die Musik ohne Lücke loopt
function trimSilence(buffer, threshold = 0.01) {
  const data = buffer.getChannelData(0);
  let first = 0;
  let last = data.length - 1;
  while (first < data.length && Math.abs(data[first]) < threshold) first++;
  while (last > first && Math.abs(data[last]) < threshold) last--;
  return { start: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate };
}
