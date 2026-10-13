// Procedural spatial audio (Web Audio API). Everything is synthesised at runtime — no audio files,
// no licensing issues. City bed, crows, rain/thunder, engines, horns, trains, announcements, footsteps.
import * as THREE from 'three';
import { Game } from '../game/Game';
import { Settings } from '../game/settings';
import { EngineSound, HornType } from '../config/vehicles';
import { STATIONS } from '../world/layout';
import { makeRng } from '../core/math';

type Voice = { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode; panner: PannerNode; kind: EngineSound };

export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private city!: { g: GainNode; f: BiquadFilterNode };
  private rain!: { g: GainNode };
  private trainBus!: { g: GainNode; f: BiquadFilterNode };
  private engine: Voice | null = null;
  private engineKind: EngineSound | null = null;
  private aiVoices: Voice[] = [];
  private rng = makeRng(8);
  private crowTimer = 4;
  private vendorTimer = 20;
  private clackT = 0;
  private stepPhase = 0;
  private hornCd = 0;
  private volume: number;

  constructor(private g: Game, private settings: Settings) {
    this.volume = settings.volume;
    const unlock = () => this.resume();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    g.events.on('shop:purchase', () => this.blip(880, 0.08, 'triangle', 0.12));
    g.events.on('notify', (n) => { if (n.kind === 'money') this.chaChing(); else if (n.kind === 'mission') this.blip(660, 0.12, 'sine', 0.1); });
    g.env.onLightning = (d) => setTimeout(() => this.thunder(d), Math.min(6000, d * 2.9));
    // train announcements are hooked after construction (TrainSystem is created before/after us)
    queueMicrotask(() => {
      const trains = (window as any).gameplay?.trains;
      if (trains) trains.onAnnounce = (st: any, t: any, kind: 'arriving' | 'departing') => this.announce(st, t, kind);
    });
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private init() {
    try { this.ctx = new AudioContext(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);
    // 3 s of brown-ish noise
    const len = c.sampleRate * 3;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.2 + w * 0.05; }
    // city bed
    this.city = this.loopNoise(260, 0.0);
    this.rain = { g: this.loopNoise(4000, 0, 'highpass', 900).g };
    this.trainBus = this.loopNoise(180, 0);
  }

  private loopNoise(freq: number, gain: number, type: BiquadFilterType = 'lowpass', hp = 0) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = type === 'highpass' ? hp : freq;
    const g = c.createGain();
    g.gain.value = gain;
    if (type === 'highpass') {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = freq;
      src.connect(f).connect(lp).connect(g).connect(this.master);
    } else src.connect(f).connect(g).connect(this.master);
    src.start();
    return { g, f };
  }

  private panner(x: number, y: number, z: number) {
    const p = this.ctx!.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.maxDistance = 200;
    p.rolloffFactor = 1.2;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    p.connect(this.master);
    return p;
  }

  private makeEngine(kind: EngineSound, dest: AudioNode): Voice {
    const c = this.ctx!;
    const gain = c.createGain();
    gain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    const types: OscillatorType[] = kind === 'electric' ? ['sine', 'sine'] : kind === 'auto' || kind === 'scooter' || kind === 'bike' ? ['square', 'sawtooth'] : ['sawtooth', 'sawtooth'];
    const osc = types.map((t, i) => {
      const o = c.createOscillator();
      o.type = t;
      o.detune.value = i * 7;
      o.connect(filter);
      o.start();
      return o;
    });
    filter.connect(gain).connect(dest);
    return { osc, gain, filter, panner: dest as PannerNode, kind };
  }

  private setEngine(v: Voice, rpm: number, throttle: number, vol: number) {
    const k = v.kind;
    // firing frequency: single-cylinder bikes/autos thump low, cars hum higher
    const cyl = k === 'auto' || k === 'scooter' || k === 'bike' ? 0.5 : k === 'sportbike' ? 1 : k === 'diesel' ? 2 : k === 'sports' ? 4 : 2;
    let f = Math.max(14, (rpm / 60) * cyl);
    if (k === 'electric') f = 220 + rpm * 0.12;
    const t = this.ctx!.currentTime;
    v.osc[0].frequency.setTargetAtTime(f, t, 0.05);
    v.osc[1].frequency.setTargetAtTime(f * (k === 'electric' ? 2.01 : 1.5), t, 0.05);
    v.filter.frequency.setTargetAtTime((k === 'diesel' ? 280 : k === 'auto' ? 520 : 380) + throttle * 900 + rpm * 0.05, t, 0.08);
    v.gain.gain.setTargetAtTime(vol * (0.35 + throttle * 0.65), t, 0.08);
  }

  horn(type: HornType, x: number, y: number, z: number, dur = 0.45, vol = 0.5) {
    if (!this.ctx) return;
    const c = this.ctx;
    const p = this.panner(x, y, z);
    const g = c.createGain();
    const t = c.currentTime;
    const freqs = type === 'air' ? [233, 311] : type === 'bike' ? [520, 0] : type === 'auto' ? [430, 0] : [410, 500];
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = type === 'air' ? 500 : 900; bp.Q.value = 0.8;
    g.connect(bp).connect(p);
    const pulses = type === 'auto' ? 2 : 1;
    for (const f of freqs) {
      if (!f) continue;
      for (let k = 0; k < pulses; k++) {
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(g);
        const st = t + k * 0.22;
        o.start(st);
        o.stop(st + (pulses > 1 ? 0.16 : dur));
      }
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.35, t + 0.02);
    g.gain.setValueAtTime(vol * 0.35, t + dur * (pulses > 1 ? 1.2 : 0.9));
    g.gain.linearRampToValueAtTime(0, t + dur * (pulses > 1 ? 1.3 : 1) + 0.05);
    setTimeout(() => p.disconnect(), (dur + 1) * 1000);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private chaChing() { this.blip(1320, 0.12, 'triangle', 0.1); setTimeout(() => this.blip(1760, 0.25, 'triangle', 0.08), 90); }

  private noiseBurst(dest: AudioNode, dur: number, freq: number, vol: number, type: BiquadFilterType = 'bandpass', q = 1) {
    const c = this.ctx!, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 2, dur + 0.05);
  }

  private thunder(dist: number) {
    if (!this.ctx) return;
    const vol = Math.min(0.9, 600 / dist);
    this.noiseBurst(this.master, 3.5, 90, vol, 'lowpass');
    setTimeout(() => this.noiseBurst(this.master, 2.5, 140, vol * 0.6, 'lowpass'), 300);
  }

  private crow(x: number, y: number, z: number) {
    // "kaa-kaa": two harsh formant bursts with falling pitch
    const c = this.ctx!;
    const p = this.panner(x, y, z);
    for (let k = 0; k < 2 + this.rng.int(0, 1); k++) {
      setTimeout(() => {
        if (!this.ctx) return;
        const t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(620, t);
        o.frequency.exponentialRampToValueAtTime(420, t + 0.22);
        f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2.5;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(f).connect(g).connect(p);
        o.start(t); o.stop(t + 0.3);
      }, k * 330);
    }
    setTimeout(() => p.disconnect(), 2000);
  }

  private say(text: string, lang = 'hi-IN', rate = 1) {
    if (!this.settings.voices || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      u.volume = Math.min(1, this.volume);
      const v = speechSynthesis.getVoices().find((x) => x.lang === lang) ?? speechSynthesis.getVoices().find((x) => x.lang.startsWith(lang.slice(0, 2)));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch { /* speech unavailable */ }
  }

  announce(st: { id: string; name: string; nameHi: string; z: number }, t: { dir: number; side: number }, kind: 'arriving' | 'departing') {
    if (!this.ctx) return;
    const ps = this.g.player.s;
    if (Math.abs(ps.z - st.z) > 140 || ps.x < 150) return; // only audible in the station precinct
    // three-note station chime
    [659, 523, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.6, 'sine', 0.12), i * 380));
    const towards = t.dir < 0 ? STATIONS[0] : STATIONS[STATIONS.length - 1];
    const pf = t.side < 0 ? 1 : 2;
    if (kind === 'arriving') {
      setTimeout(() => this.say(`Platform kramank ${pf === 1 ? 'ek' : 'do'} par aane wali gaadi, ${towards.name} ki taraf jaane wali dheemi local hai.`, 'hi-IN', 0.95), 1300);
      setTimeout(() => this.say(`The next train on platform number ${pf} is a slow local to ${towards.name}.`, 'en-IN', 0.95), 7500);
    }
  }

  update(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const g = this.g;
    const cam = g.camera;
    const L = this.ctx.listener;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    if (L.positionX) {
      L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }
    const t = this.ctx.currentTime;
    const playing = g.state === 'playing';
    const hour = g.clock.hour;
    const busy = (hour > 7 && hour < 23 ? 1 : 0.35) * (playing ? 1 : 0.6);
    const indoorLp = g.vm.current && !g.vm.current.twoWheeler && g.vm.current.type !== 'auto_rickshaw' ? 0.5 : 1;
    this.city.g.gain.setTargetAtTime(0.18 * busy, t, 0.5);
    this.city.f.frequency.setTargetAtTime(320 * indoorLp, t, 0.5);
    this.rain.g.gain.setTargetAtTime(0.35 * g.env.rainAmount * indoorLp, t, 0.5);

    // player vehicle engine
    const v = g.vm.current;
    if (v && v.state.engineOn) {
      if (this.engineKind !== v.spec.engine) {
        this.engine?.osc.forEach((o) => o.stop());
        this.engine?.gain.disconnect();
        this.engine = this.makeEngine(v.spec.engine, this.master);
        this.engineKind = v.spec.engine;
      }
      this.setEngine(this.engine!, v.state.rpm, v.controls.throttle, 0.16);
      this.hornCd -= dt;
      if (v.horn && this.hornCd <= 0) { this.horn(v.spec.horn, v.state.x, v.state.y + 1, v.state.z, 0.4, 0.8); this.hornCd = 0.45; }
    } else if (this.engine) {
      this.engine.gain.gain.setTargetAtTime(0, t, 0.1);
    }
    // nearest AI vehicle engines (3 voices)
    const traffic = (window as any).gameplay?.traffic;
    if (traffic) {
      const near = [...traffic.vehicles].sort((a: any, b: any) => (a.x - cam.position.x) ** 2 + (a.z - cam.position.z) ** 2 - ((b.x - cam.position.x) ** 2 + (b.z - cam.position.z) ** 2)).slice(0, 3);
      while (this.aiVoices.length < 3) {
        const p = this.panner(0, 0, 0);
        this.aiVoices.push(this.makeEngine('car', p));
      }
      near.forEach((tv: any, i: number) => {
        const voice = this.aiVoices[i];
        voice.kind = tv.spec.engine;
        voice.panner.positionX.value = tv.x; voice.panner.positionY.value = 0.8; voice.panner.positionZ.value = tv.z;
        this.setEngine(voice, 900 + tv.v * 160, tv.v > 0.5 ? 0.5 : 0.1, 0.09);
      });
      for (const h of traffic.honks.splice(0)) this.horn(h.type, h.x, 1, h.z, 0.35 + Math.random() * 0.3, 0.5);
    }
    // trains: rumble + rail joint clack near the listener
    const trains = (window as any).gameplay?.trains;
    if (trains) {
      let best = Infinity, sp = 0;
      for (const tr of trains.trains) {
        const dz = Math.max(0, Math.abs(cam.position.z - (tr.front - tr.dir * 62)) - 62);
        const d = Math.hypot(cam.position.x - tr.trackX, dz);
        if (d < best) { best = d; sp = tr.v; }
      }
      const riding = !!trains.riding;
      const vol = (riding ? 0.5 : Math.min(0.6, 30 / (best + 5))) * Math.min(1, sp / 6);
      this.trainBus.g.gain.setTargetAtTime(vol, t, 0.3);
      this.trainBus.f.frequency.setTargetAtTime(150 + sp * 12, t, 0.3);
      this.clackT -= dt * sp;
      if (this.clackT <= 0 && vol > 0.02) {
        this.clackT = 13; // rail joints every ~13 m
        this.noiseBurst(this.master, 0.06, 2200, vol * 0.5, 'bandpass', 3);
        setTimeout(() => this.ctx && this.noiseBurst(this.master, 0.06, 1900, vol * 0.4, 'bandpass', 3), 110);
      }
    }
    // crows, vendor calls, footsteps
    this.crowTimer -= dt;
    if (this.crowTimer <= 0 && hour > 6 && hour < 19.5 && g.env.rainAmount < 0.5) {
      this.crowTimer = this.rng.range(6, 18);
      this.crow(cam.position.x + this.rng.range(-30, 30), cam.position.y + this.rng.range(5, 15), cam.position.z + this.rng.range(-30, 30));
    }
    this.vendorTimer -= dt;
    if (this.vendorTimer <= 0 && playing) {
      this.vendorTimer = this.rng.range(25, 60);
      const ps = g.player.s;
      if (Math.abs(ps.z + 100) < 20 && hour > 8 && hour < 22) this.say(this.rng.pick(['Chai, garam chai!', 'Vada pav, garam garam!', 'Taaza sabzi le lo!', 'Aao bhaiya, dekh lo!']), 'hi-IN', 1.05);
    }
    if (playing && !v && g.player.s.grounded) {
      this.stepPhase += dt * g.player.s.speed * 1.35;
      if (this.stepPhase > 1) {
        this.stepPhase = 0;
        const tag = g.player.surfaceTag;
        this.noiseBurst(this.master, 0.07, tag === 'platform' || tag === 'fob' || tag === 'stairs' ? 1500 : tag === 'grass' ? 600 : 1100, 0.07 + g.env.wetness * 0.03, 'bandpass', 1.5);
      }
    }
  }
}
