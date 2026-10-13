// Central material library. Night-lit materials are registered so the day/night system can drive them.
import * as THREE from 'three';
import {
  paverSet, concreteSet, groundSet, facadeSet, SignAtlas, FacadeStyle, canvasTexture,
  asphaltSet2, plasterSet, barkSet, clothTexture, wornPaintTexture, blobDecal, streakTexture, grateTexture, shutterTexture2, leafCard, frondTexture, plateTexture, textPanel, packagingAtlas,
} from './textures';

export class MaterialLib {
  private cache = new Map<string, THREE.Material>();
  /** Materials whose emissive intensity follows the night factor. value = max intensity. */
  nightLit: { mat: THREE.MeshStandardMaterial; max: number }[] = [];
  /** Materials whose roughness drops when roads are wet. */
  wettable: { mat: THREE.MeshStandardMaterial; dry: number; wet: number }[] = [];
  signs = new SignAtlas();
  private defs = new Map<string, (vc: boolean) => THREE.Material>();

  constructor() {
    // Textures are generated lazily the first time a material needs them.
    const L = <T,>(fn: () => T) => { let v: T | undefined; return () => (v ??= fn()); };
    const asphalt = L(() => asphaltSet2(7));
    const paver = L(() => paverSet(11));
    const paverWarm = L(() => paverSet(19, [150, 134, 114]));
    const conc = L(() => concreteSet(3, 150));
    const concDark = L(() => concreteSet(9, 105));
    const grass = L(() => groundSet('grass', 5));
    const dirt = L(() => groundSet('dirt', 6));
    const ballast = L(() => groundSet('ballast', 8));
    const sand = L(() => groundSet('sand', 10));
    const plaster = L(() => plasterSet(31, 0.45));
    const plasterOld = L(() => plasterSet(57, 0.95));
    const bark = L(() => barkSet(17));
    const cloth = L(() => clothTexture(3));
    const worn = L(() => wornPaintTexture(13));

    this.def('asphalt', () => this.wet(new THREE.MeshStandardMaterial({ map: asphalt().map, normalMap: asphalt().normal, roughnessMap: asphalt().rough, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) }), 1, 0.3));
    this.def('paver', () => this.wet(new THREE.MeshStandardMaterial({ map: paver().map, normalMap: paver().normal, roughness: 0.92 }), 0.92, 0.35));
    this.def('paver_warm', () => this.wet(new THREE.MeshStandardMaterial({ map: paverWarm().map, normalMap: paverWarm().normal, roughness: 0.9 }), 0.9, 0.35));
    this.def('concrete', (vc) => new THREE.MeshStandardMaterial({ map: conc().map, normalMap: conc().normal, roughness: 0.92, vertexColors: vc }));
    this.def('concrete_dark', (vc) => new THREE.MeshStandardMaterial({ map: concDark().map, normalMap: concDark().normal, roughness: 0.95, vertexColors: vc }));
    this.def('plaster', (vc) => new THREE.MeshStandardMaterial({ map: plaster().map, normalMap: plaster().normal, roughnessMap: plaster().rough, normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: vc }));
    this.def('plaster_old', (vc) => new THREE.MeshStandardMaterial({ map: plasterOld().map, normalMap: plasterOld().normal, roughnessMap: plasterOld().rough, normalScale: new THREE.Vector2(0.9, 0.9), vertexColors: vc }));
    this.def('grass', () => new THREE.MeshStandardMaterial({ map: grass().map, normalMap: grass().normal, roughness: 1 }));
    this.def('dirt', () => new THREE.MeshStandardMaterial({ map: dirt().map, normalMap: dirt().normal, roughness: 1 }));
    this.def('ballast', () => new THREE.MeshStandardMaterial({ map: ballast().map, normalMap: ballast().normal, roughness: 1 }));
    this.def('sand', () => new THREE.MeshStandardMaterial({ map: sand().map, normalMap: sand().normal, roughness: 1 }));
    this.def('curb', () => new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.88 }));
    // Worn road paint: alpha-tested abrasion so markings look used, not freshly printed.
    this.def('marking_white', () => this.wet(new THREE.MeshStandardMaterial({ color: 0xd9d6cc, map: worn(), alphaTest: 0.35, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.75, 0.3));
    this.def('marking_yellow', () => this.wet(new THREE.MeshStandardMaterial({ color: 0xd6a51c, map: worn(), alphaTest: 0.35, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.75, 0.3));
    // Road decals: tar patches, dust at kerbs, oil, tyre polish (alpha-blended, no depth write)
    const decal = (tex: () => THREE.Texture, rough: number, dry = rough) => () => this.wet(new THREE.MeshStandardMaterial({
      map: tex(), transparent: true, depthWrite: false, roughness: rough, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }), dry, Math.min(rough, 0.3));
    const patchTex = L(() => blobDecal(61, [24, 24, 25], 0.85));
    const dustTex = L(() => blobDecal(62, [120, 104, 84], 0.2));
    const oilTex = L(() => blobDecal(63, [12, 12, 14], 0.3));
    this.def('road_patch', decal(patchTex, 0.95));
    this.def('road_dust', decal(dustTex, 1));
    this.def('road_oil', decal(oilTex, 0.5));
    this.def('grime', () => new THREE.MeshStandardMaterial({ map: streakTexture(41), transparent: true, depthWrite: false, roughness: 1, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.def('grate', () => new THREE.MeshStandardMaterial({ map: grateTexture('grate'), roughness: 0.6, metalness: 0.6 }));
    this.def('manhole', () => new THREE.MeshStandardMaterial({ map: grateTexture('manhole'), roughness: 0.55, metalness: 0.7 }));

    const styles: FacadeStyle[] = ['apartment', 'chawl', 'glass', 'heritage', 'modern', 'settlement'];
    styles.forEach((s, i) => {
      for (const v of ['', '_b']) {
        const f = L(() => facadeSet(s, i + (v ? 17 : 1)));
        this.def(`facade_${s}${v}`, (vc) => this.night(new THREE.MeshStandardMaterial({
          map: f().map, emissiveMap: f().emissive, emissive: 0xffffff, emissiveIntensity: 0,
          roughness: s === 'glass' ? 0.15 : 0.92, metalness: s === 'glass' ? 0.5 : 0, vertexColors: vc,
          envMapIntensity: s === 'glass' ? 1.2 : 0.5,
        }), s === 'glass' ? 1.1 : 1.6));
      }
    });
    const shutters = L(() => shutterTexture2(5));
    this.def('shutter', (vc) => new THREE.MeshStandardMaterial({ map: shutters(), roughness: 0.62, metalness: 0.55, vertexColors: vc }));
    this.def('signs', () => this.night(new THREE.MeshStandardMaterial({ map: this.signs.texture, emissiveMap: this.signs.texture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55 }), 0.9));
    this.def('paint', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, vertexColors: vc }));
    this.def('frame', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.15, vertexColors: vc }));
    this.def('plastic', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, vertexColors: vc }));
    this.def('metal', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.7, vertexColors: vc }));
    this.def('rust', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.45, vertexColors: vc, map: conc().map }));
    this.def('fabric', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: vc, side: THREE.DoubleSide }));
    this.def('cloth', (vc) => new THREE.MeshStandardMaterial({ map: cloth(), roughness: 0.95, vertexColors: vc, side: THREE.DoubleSide }));
    this.def('foliage', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: vc }));
    this.def('bark', (vc) => new THREE.MeshStandardMaterial({ map: bark().map, normalMap: bark().normal, roughness: 0.95, vertexColors: vc }));
    const leaves = L(() => leafCard(4, 'green')), blossoms = L(() => leafCard(8, 'gulmohar')), palm = L(() => frondTexture(9));
    const leafMat = (tex: () => THREE.Texture) => (vc: boolean) => new THREE.MeshStandardMaterial({ map: tex(), alphaTest: 0.38, side: THREE.DoubleSide, roughness: 1, metalness: 0, vertexColors: vc, envMapIntensity: 0.2 });
    this.def('leaves', leafMat(leaves));
    this.def('blossoms', leafMat(blossoms));
    this.def('palm', leafMat(palm));
    this.def('glass', () => new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.3 }));
    this.def('win_glass', () => new THREE.MeshStandardMaterial({ color: 0x10161a, roughness: 0.08, metalness: 0.1, envMapIntensity: 1.1 }));
    this.def('win_glass_tower', () => new THREE.MeshStandardMaterial({ color: 0x23343d, roughness: 0.05, metalness: 0.45, envMapIntensity: 1.4 }));
    this.def('win_lit_warm', () => this.night(new THREE.MeshStandardMaterial({ color: 0x14130f, roughness: 0.1, emissive: 0xffbe78, emissiveIntensity: 0, envMapIntensity: 1 }), 2.2));
    this.def('win_lit_cool', () => this.night(new THREE.MeshStandardMaterial({ color: 0x12151a, roughness: 0.1, emissive: 0xcfe2ff, emissiveIntensity: 0, envMapIntensity: 1 }), 1.8));
    const packs = L(() => packagingAtlas(77));
    this.def('goods', () => new THREE.MeshStandardMaterial({ map: packs(), roughness: 0.55 }));
    // ---- vehicle materials
    this.def('car_paint', (vc) => new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.34, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1 }));
    this.def('car_trim', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.62 }));
    this.def('chrome', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.16, metalness: 1, envMapIntensity: 1.2 }));
    this.def('rubber', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.92 }));
    this.def('vinyl', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.55 }));
    this.def('canvas', (vc) => new THREE.MeshStandardMaterial({ map: cloth(), color: 0xffffff, vertexColors: vc, roughness: 0.9, side: THREE.DoubleSide }));
    this.def('car_glass', () => new THREE.MeshPhysicalMaterial({ color: 0x1d262c, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.62, envMapIntensity: 1.4, depthWrite: false }));
    // lenses only: parked/AI vehicles must not glow; the player's vehicle gets a real spotlight
    this.def('headlight', () => new THREE.MeshStandardMaterial({ color: 0xe9eef2, roughness: 0.06, metalness: 0.4, envMapIntensity: 1.4 }));
    this.def('taillight', () => new THREE.MeshStandardMaterial({ color: 0x8a0d0d, roughness: 0.15, emissive: 0xff1a1a, emissiveIntensity: 0.06 }));
    this.def('indicator', (vc) => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.15 }));
    this.def('reflector', () => new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.2 }));
    this.def('beacon', (vc) => this.night(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.2, emissive: 0x330000, emissiveIntensity: 0.3 }), 1, 0.3));
    this.def('taxi_sign', (vc) => this.night(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: vc, roughness: 0.3, emissive: 0xffd24a, emissiveIntensity: 0 }), 1.2));
    this.def('meter', () => new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a10, emissiveIntensity: 1.2 }));
    const plate = L(() => plateTexture('MH 02 AB 4521', 'private'));
    this.def('plate', () => new THREE.MeshStandardMaterial({ map: plate(), roughness: 0.4 }));
    const led = L(() => textPanel([{ text: '202  SAGAR NAGAR STN (W)', color: '#ff9a1f', size: 0.7, font: '"Courier New", monospace', weight: '700' }], '#140800', 512, 64));
    this.def('led_board', () => new THREE.MeshStandardMaterial({ map: led(), emissiveMap: led(), emissive: 0xffffff, emissiveIntensity: 1.1 }));
    const horn = L(() => textPanel([{ text: 'HORN OK PLEASE', color: '#c2185b', size: 0.6, weight: '900' }, { text: '★ Buri nazar wale tera muh kala ★', color: '#1b5e20', size: 0.3 }], '#ffe08a', 512, 192, '#c2185b'));
    this.def('horn_ok', () => new THREE.MeshStandardMaterial({ map: horn(), roughness: 0.7 }));
    this.def('lamp', (vc) => this.night(new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.3, vertexColors: vc }), 6));
    this.def('lamp_white', (vc) => this.night(new THREE.MeshStandardMaterial({ color: 0xf0f6ff, emissive: 0xe8f0ff, emissiveIntensity: 0.4, roughness: 0.3, vertexColors: vc }), 4, 0.4));
    this.def('neon', (vc) => this.night(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.4, vertexColors: vc }), 2.5, 0.15));
  }

  private def(key: string, fn: (vc: boolean) => THREE.Material) { this.defs.set(key, fn); }

  private night<T extends THREE.MeshStandardMaterial>(m: T, max: number, min = 0): T {
    this.nightLit.push({ mat: m, max: max - min });
    (m.userData as any).nightMin = min;
    return m;
  }

  private wet<T extends THREE.MeshStandardMaterial>(m: T, dry: number, wet: number): T {
    this.wettable.push({ mat: m, dry, wet });
    return m;
  }

  get(key: string, vertexColors = false): THREE.Material {
    const ck = `${key}|${vertexColors}`;
    let m = this.cache.get(ck);
    if (!m) {
      const fn = this.defs.get(key);
      if (!fn) throw new Error(`Unknown material ${key}`);
      m = fn(vertexColors);
      m.name = key;
      this.cache.set(ck, m);
    }
    return m;
  }

  setNight(f: number) {
    for (const { mat, max } of this.nightLit) mat.emissiveIntensity = ((mat.userData as any).nightMin ?? 0) + f * max;
  }

  setWetness(w: number) {
    for (const { mat, dry, wet } of this.wettable) mat.roughness = dry + (wet - dry) * w;
  }
}

function curbTexture() {
  // Classic Indian black & yellow painted kerb stones.
  return canvasTexture(128, 32, (ctx, w, h, rng) => {
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i === 0 ? '#e5c12c' : '#1d1d1d';
      ctx.fillRect((i * w) / 2, 0, w / 2, h);
    }
    for (let k = 0; k < 60; k++) {
      ctx.fillStyle = `rgba(90,80,60,${rng.range(0.05, 0.25)})`;
      ctx.fillRect(rng.range(0, w), rng.range(0, h), rng.range(1, 8), rng.range(1, 5));
    }
  }, 4);
}
