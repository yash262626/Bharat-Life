// Sky, sun/moon lighting, fog, day-night cycle, monsoon weather (rain, storms, wet roads), night light pools.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep, makeRng } from '../core/math';
import { MaterialLib } from './materials';
import { LightSpot } from './BuildContext';
import { CollisionWorld } from './Collision';
import { fbm, makeCanvas, toTexture } from './textures';
import type { HdriKey } from '../render/hdri';

export type WeatherKind = 'clear' | 'hazy' | 'cloudy' | 'light_rain' | 'heavy_rain' | 'storm';

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Clear', hazy: 'Hazy', cloudy: 'Cloudy', light_rain: 'Light rain', heavy_rain: 'Heavy monsoon rain', storm: 'Thunderstorm',
};

interface WeatherParams { cloud: number; rain: number; fog: number; wind: number }
const WEATHER: Record<WeatherKind, WeatherParams> = {
  clear: { cloud: 0.1, rain: 0, fog: 0.0010, wind: 0.2 },
  hazy: { cloud: 0.25, rain: 0, fog: 0.0028, wind: 0.1 },
  cloudy: { cloud: 0.75, rain: 0, fog: 0.0018, wind: 0.4 },
  light_rain: { cloud: 0.9, rain: 0.35, fog: 0.004, wind: 0.5 },
  heavy_rain: { cloud: 1, rain: 0.85, fog: 0.0085, wind: 0.8 },
  storm: { cloud: 1, rain: 1, fog: 0.0105, wind: 1 },
};

export type Season = 'monsoon' | 'summer' | 'winter';
const SEASON_WEIGHTS: Record<Season, [WeatherKind, number][]> = {
  monsoon: [['clear', 10], ['cloudy', 28], ['light_rain', 30], ['heavy_rain', 20], ['storm', 12]],
  summer: [['clear', 55], ['hazy', 30], ['cloudy', 15]],
  winter: [['clear', 45], ['hazy', 45], ['cloudy', 10]],
};

export class Environment {
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xbfd6ff, 0x6b5a48, 1.0);
  sky = new Sky();
  fog = new THREE.FogExp2(0xc9d3d8, 0.002);
  nightFactor = 0;
  wetness = 0;
  rainAmount = 0;
  cloudAmount = 0;
  weather: WeatherKind = 'cloudy';
  targetWeather: WeatherKind = 'cloudy';
  season: Season = 'monsoon';
  private cur: WeatherParams = { ...WEATHER.cloudy };
  private nextWeatherChangeMin = 0;
  private rain: THREE.LineSegments;
  private rainMat: THREE.ShaderMaterial;
  private clouds: THREE.Mesh;
  private stars: THREE.Points;
  private pools: THREE.InstancedMesh;
  private poolLights: THREE.PointLight[] = [];
  private lightSpots: LightSpot[] = [];
  private poolTimer = 0;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envSky = new Sky();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTimer = 99;
  private lastEnvSunY = -9;
  private lightning = 0;
  private lightningTimer = 5;
  private rng = makeRng(3);
  onLightning: (distance: number) => void = () => {};
  private hdris: Partial<Record<HdriKey, THREE.Texture>> = {};
  private hdriKey: HdriKey | null = null;
  sunDir = new THREE.Vector3();
  shadowExtent = 70;

  constructor(private scene: THREE.Scene, renderer: THREE.WebGLRenderer, private mats: MaterialLib) {
    scene.fog = this.fog;
    this.sky.scale.setScalar(6000);
    this.sky.renderOrder = -10;
    const u = this.sky.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky);
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const cam = this.sun.shadow.camera;
    cam.near = 1; cam.far = 600;
    this.setShadowExtent(70);
    scene.add(this.sun, this.sun.target, this.hemi);

    this.rainMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, amount: { value: 0 }, wind: { value: 0 }, color: { value: new THREE.Color(0.75, 0.8, 0.88) } },
      vertexShader: /* glsl */`
        attribute float endFlag;
        attribute float seed;
        uniform float time; uniform vec3 center; uniform float amount; uniform float wind;
        varying float vAlpha;
        void main(){
          vec3 box = vec3(50.0, 30.0, 50.0);
          float speed = 14.0 + seed * 6.0;
          vec3 p = position;
          p.y = p.y - time * speed;
          p.x += time * wind * 3.0;
          p = mod(p - center + box * 0.5, box) - box * 0.5 + center;
          p.y -= endFlag * (0.35 + 0.25 * amount);
          p.x -= endFlag * wind * 0.12;
          vAlpha = step(seed, amount) * (0.35 + 0.3 * (1.0 - endFlag));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 color; varying float vAlpha;
        void main(){ if (vAlpha <= 0.0) discard; gl_FragColor = vec4(color, vAlpha); }`,
    });
    const N = 9000;
    const pos = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), seed = new Float32Array(N * 2);
    const r = makeRng(9);
    for (let i = 0; i < N; i++) {
      const x = r.range(-25, 25), y = r.range(-15, 15), z = r.range(-25, 25), s = r.next();
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        seed[i * 2 + k] = s;
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rg.setAttribute('endFlag', new THREE.BufferAttribute(end, 1));
    rg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 5;
    scene.add(this.rain);

    // Cloud dome
    const S = 512;
    const n = fbm(S, S, makeRng(21), 128, 6);
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = smoothstep(0.42, 0.75, n[i]);
      img.data[i * 4] = 255; img.data[i * 4 + 1] = 255; img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = v * 255;
    }
    ctx.putImageData(img, 0, 0);
    const ct = toTexture(c);
    ct.repeat.set(3, 3);
    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.48),
      new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, side: THREE.BackSide, fog: false, opacity: 0.6 }),
    );
    this.clouds.renderOrder = -9;
    scene.add(this.clouds);

    // Stars
    const sp = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const th = r.range(0, Math.PI * 2), ph = Math.acos(r.range(0.05, 1));
      sp.set([Math.sin(ph) * Math.cos(th) * 3200, Math.cos(ph) * 3200, Math.sin(ph) * Math.sin(th) * 3200], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // Ground light pools (cheap fake lighting under streetlights at night)
    const pc = makeCanvas(128, 128);
    const pctx = pc.getContext('2d')!;
    const g = pctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, 128, 128);
    const poolTex = toTexture(pc);
    poolTex.wrapS = poolTex.wrapT = THREE.ClampToEdgeWrapping;
    const pg = new THREE.PlaneGeometry(1, 1);
    pg.rotateX(-Math.PI / 2);
    this.pools = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc98a, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, fog: true }), 1);
    this.pools.renderOrder = 2;
    this.pools.frustumCulled = false;

    for (let i = 0; i < 10; i++) {
      const pl = new THREE.PointLight(0xffc98a, 0, 26, 1.6);
      pl.castShadow = false;
      this.poolLights.push(pl);
      scene.add(pl);
    }
  }

  /** Use CC0 HDR environment maps for image-based lighting (replaces the sky-generated env map). */
  setHdris(h: Partial<Record<HdriKey, THREE.Texture>>) {
    this.hdris = h;
    this.hdriKey = null;
  }

  private pickHdri(hour: number, overcast: number): HdriKey {
    if (hour < 5.4 || hour >= 19.4) return 'night';
    if (hour < 7.3) return 'dawn';
    if (hour >= 17.0) return 'sunset';
    return overcast > 0.55 ? 'overcast' : 'day';
  }

  setShadowExtent(e: number) {
    this.shadowExtent = e;
    const cam = this.sun.shadow.camera;
    cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e;
    cam.updateProjectionMatrix();
  }

  setShadowQuality(size: number, enabled: boolean) {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); (this.sun.shadow as any).map = null; }
    this.sun.shadow.mapSize.set(size, size);
  }

  /** Register static light spots (streetlights, shops) and build ground light pools. */
  setLightSpots(spots: LightSpot[], col: CollisionWorld) {
    this.lightSpots = spots;
    this.scene.remove(this.pools);
    const mat = this.pools.material as THREE.MeshBasicMaterial;
    this.pools = new THREE.InstancedMesh(this.pools.geometry, mat, spots.length);
    this.pools.renderOrder = 2;
    this.pools.frustumCulled = false;
    const m = new THREE.Matrix4();
    spots.forEach((s, i) => {
      const gy = col.groundHeight(s.x, s.z, s.y - 0.5) + 0.03;
      const size = s.kind === 'street' ? 13 : s.kind === 'flood' ? 16 : s.kind === 'tube' ? 7 : 6;
      m.makeScale(size, 1, size).setPosition(s.x, gy, s.z);
      this.pools.setMatrixAt(i, m);
      this.pools.setColorAt(i, new THREE.Color(s.kind === 'street' ? 0xffc27a : s.kind === 'tube' ? 0xd8ecff : 0xfff1d6));
    });
    this.scene.add(this.pools);
  }

  /** Force a weather state (debug / missions). */
  setWeather(k: WeatherKind, instant = false) {
    this.targetWeather = k;
    if (instant) {
      this.weather = k;
      this.cur = { ...WEATHER[k] };
    }
  }

  private pickWeather(): WeatherKind {
    const w = SEASON_WEIGHTS[this.season];
    const total = w.reduce((s, [, x]) => s + x, 0);
    let r = this.rng.next() * total;
    for (const [k, x] of w) { r -= x; if (r <= 0) return k; }
    return 'clear';
  }

  update(dt: number, hour: number, totalMinutes: number, focus: THREE.Vector3, camera: THREE.Camera) {
    // weather transitions
    if (totalMinutes >= this.nextWeatherChangeMin) {
      if (this.nextWeatherChangeMin > 0) this.targetWeather = this.pickWeather();
      this.nextWeatherChangeMin = totalMinutes + this.rng.range(120, 330);
    }
    const tgt = WEATHER[this.targetWeather];
    const k = 1 - Math.exp(-dt * 0.08);
    this.cur.cloud = lerp(this.cur.cloud, tgt.cloud, k);
    this.cur.rain = lerp(this.cur.rain, tgt.rain, k * 1.2);
    this.cur.fog = lerp(this.cur.fog, tgt.fog, k);
    this.cur.wind = lerp(this.cur.wind, tgt.wind, k);
    if (Math.abs(this.cur.rain - tgt.rain) < 0.02 && Math.abs(this.cur.cloud - tgt.cloud) < 0.02) this.weather = this.targetWeather;
    this.rainAmount = this.cur.rain;
    this.cloudAmount = this.cur.cloud;
    // wetness lags rain: roads stay wet after the rain stops
    const wetTarget = this.cur.rain > 0.05 ? 1 : 0;
    this.wetness = clamp(this.wetness + (wetTarget ? dt * 0.08 * (0.3 + this.cur.rain) : -dt * 0.004), 0, 1);

    // Sun position (Mumbai ~19N): rises in the east (+x), arcs through the south (+z), sets west.
    const dayT = (hour - 6.25) / (18.75 - 6.25); // 0 sunrise .. 1 sunset
    const el = Math.sin(clamp(dayT, -0.25, 1.25) * Math.PI) * (Math.PI / 2) * 0.82;
    const az = lerp(0, Math.PI, dayT);
    this.sunDir.set(Math.cos(az), Math.sin(el), Math.sin(az) * 0.35).normalize();
    const elevDeg = (Math.asin(this.sunDir.y) * 180) / Math.PI;
    this.nightFactor = 1 - smoothstep(-7, 5, elevDeg);
    const dusk = smoothstep(25, 2, elevDeg) * (1 - this.nightFactor);
    const overcast = this.cur.cloud;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    u.turbidity.value = lerp(2.6, 12, overcast) + this.cur.fog * 300;
    u.rayleigh.value = lerp(1.9, 0.6, overcast) * (1 - this.nightFactor * 0.6);
    this.envSky.material.uniforms.sunPosition.value.copy(u.sunPosition.value);
    this.envSky.material.uniforms.turbidity.value = u.turbidity.value;
    this.envSky.material.uniforms.rayleigh.value = u.rayleigh.value;

    // Lights
    const dayAmt = 1 - this.nightFactor;
    const sunCol = new THREE.Color().setHSL(lerp(0.12, 0.06, dusk), lerp(0.25, 0.9, dusk), lerp(0.95, 0.65, dusk));
    if (this.nightFactor > 0.5) {
      // moonlight from opposite direction
      this.sun.color.set(0x9fb4e0);
      this.sun.intensity = 0.32 * (1 - overcast * 0.7);
      this.sun.position.copy(focus).add(new THREE.Vector3(-0.4, 0.8, -0.3).normalize().multiplyScalar(300));
    } else {
      this.sun.color.copy(sunCol);
      this.sun.intensity = (2.6 * dayAmt) * (1 - overcast * 0.72) * smoothstep(-3, 10, elevDeg) + 0.05;
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    }
    // Snap shadow camera to texel grid to reduce shimmering
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const tgtPos = focus.clone();
    tgtPos.x = Math.round(tgtPos.x / texel) * texel;
    tgtPos.z = Math.round(tgtPos.z / texel) * texel;
    const offset = this.sun.position.clone().sub(focus);
    this.sun.target.position.copy(tgtPos);
    this.sun.position.copy(tgtPos).add(offset);
    this.sun.target.updateMatrixWorld();

    const skyDay = new THREE.Color(0xb4cde6).lerp(new THREE.Color(0xa7adb3), overcast);
    const skyNight = new THREE.Color(0x1a2440);
    this.hemi.color.copy(skyDay).lerp(skyNight, this.nightFactor);
    this.hemi.groundColor.set(0x6b5a48).lerp(new THREE.Color(0x1a1612), this.nightFactor);
    this.hemi.intensity = lerp(0.55 + overcast * 0.4, 0.3, this.nightFactor);

    // fog colour approximates the horizon
    const fogDay = new THREE.Color(0xc5d0d6).lerp(new THREE.Color(0x9da5ab), overcast);
    const fogDusk = new THREE.Color(0xd9a07a);
    const fogNight = new THREE.Color(0x10151f);
    this.fog.color.copy(fogDay).lerp(fogDusk, dusk * (1 - overcast * 0.7)).lerp(fogNight, this.nightFactor);
    this.fog.density = this.cur.fog * (1 + this.nightFactor * 0.3);
    this.scene.background = null;

    // Lightning
    if (this.targetWeather === 'storm' && this.cur.rain > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightning = 1;
        this.lightningTimer = this.rng.range(6, 22);
        this.onLightning(this.rng.range(400, 3000));
      }
    }
    if (this.lightning > 0) {
      this.hemi.intensity += this.lightning * 4;
      this.lightning = Math.max(0, this.lightning - dt * 5);
    }

    // clouds & stars
    const cm = this.clouds.material as THREE.MeshBasicMaterial;
    cm.opacity = clamp(0.15 + overcast * 0.85, 0, 1);
    cm.color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(0x6d7378), overcast * 0.8).lerp(new THREE.Color(0x0c1018), this.nightFactor * 0.9).lerp(new THREE.Color(0xffb98a), dusk * 0.5));
    if (cm.map) cm.map.offset.x += dt * 0.0008 * (0.3 + this.cur.wind);
    this.clouds.position.set(focus.x, 0, focus.z);
    (this.stars.material as THREE.PointsMaterial).opacity = this.nightFactor * (1 - overcast);
    this.stars.position.set(focus.x, 0, focus.z);
    this.sky.position.set(focus.x, 0, focus.z);

    // rain
    this.rain.visible = this.cur.rain > 0.01;
    this.rainMat.uniforms.time.value += dt;
    this.rainMat.uniforms.amount.value = this.cur.rain;
    this.rainMat.uniforms.wind.value = this.cur.wind;
    this.rainMat.uniforms.center.value.copy((camera as THREE.PerspectiveCamera).position);
    this.rainMat.uniforms.color.value.setRGB(0.75, 0.8, 0.88).multiplyScalar(lerp(1, 0.25, this.nightFactor));

    // emissive materials and wet roads
    this.mats.setNight(this.nightFactor);
    this.mats.setWetness(this.wetness);
    (this.pools.material as THREE.MeshBasicMaterial).opacity = this.nightFactor * 0.55 * (1 + this.wetness * 0.6);

    // pooled real point lights near the camera
    this.poolTimer -= dt;
    if (this.poolTimer <= 0 && this.lightSpots.length) {
      this.poolTimer = 0.5;
      const cp = (camera as THREE.PerspectiveCamera).position;
      const sorted = this.lightSpots
        .map((s) => ({ s, d: (s.x - cp.x) ** 2 + (s.z - cp.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.poolLights.length);
      sorted.forEach(({ s }, i) => {
        const pl = this.poolLights[i];
        pl.position.set(s.x, s.y - 0.3, s.z);
        pl.color.set(s.kind === 'street' ? 0xffc27a : s.kind === 'tube' ? 0xdcecff : 0xfff0d0);
        (pl.userData as any).base = s.kind === 'street' ? 60 : s.kind === 'flood' ? 90 : 25;
      });
    }
    for (const pl of this.poolLights) pl.intensity = this.nightFactor * ((pl.userData as any).base ?? 0);

    // Image-based lighting: CC0 HDRIs when available, otherwise a PMREM capture of the sky.
    const key = this.pickHdri(hour, overcast);
    const hdri = this.hdris[key];
    if (hdri) {
      if (key !== this.hdriKey) {
        this.hdriKey = key;
        this.scene.environment = hdri;
      }
      const base = key === 'night' ? 0.55 : key === 'sunset' || key === 'dawn' ? 0.75 : 0.85;
      this.scene.environmentIntensity = base * (1 - overcast * 0.25) + this.lightning * 2;
      this.hemi.intensity *= 0.35;
    } else {
      this.envTimer += dt;
      if (this.envTimer > 3 && Math.abs(this.sunDir.y - this.lastEnvSunY) > 0.03) {
        this.envTimer = 0;
        this.lastEnvSunY = this.sunDir.y;
        this.refreshEnv();
      }
    }
  }

  refreshEnv() {
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = lerp(0.55, 0.08, this.nightFactor);
    old?.dispose();
  }

  get label() { return WEATHER_LABEL[this.weather === this.targetWeather ? this.weather : this.targetWeather]; }

  serialize() { return { weather: this.targetWeather, season: this.season, next: this.nextWeatherChangeMin, wet: this.wetness }; }
  load(s: { weather: WeatherKind; season: Season; next: number; wet: number }) {
    this.season = s.season;
    this.setWeather(s.weather, true);
    this.nextWeatherChangeMin = s.next;
    this.wetness = s.wet;
  }
}
