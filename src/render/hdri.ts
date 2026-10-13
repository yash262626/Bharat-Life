// CC0 HDR environment maps (Poly Haven, via the @pmndrs/assets npm package) used for image-based
// lighting and reflections. Loaded lazily and converted to PMREM cube maps.
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export type HdriKey = 'dawn' | 'day' | 'overcast' | 'sunset' | 'night';

const SOURCES: Record<HdriKey, () => Promise<{ default: string }>> = {
  dawn: () => import('@pmndrs/assets/hdri/dawn.exr'),
  day: () => import('@pmndrs/assets/hdri/sky.exr'),
  overcast: () => import('@pmndrs/assets/hdri/city.exr'),
  sunset: () => import('@pmndrs/assets/hdri/sunset.exr'),
  night: () => import('@pmndrs/assets/hdri/night.exr'),
};

export async function loadHdris(renderer: THREE.WebGLRenderer): Promise<Partial<Record<HdriKey, THREE.Texture>>> {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const loader = new EXRLoader();
  const out: Partial<Record<HdriKey, THREE.Texture>> = {};
  await Promise.all(
    (Object.keys(SOURCES) as HdriKey[]).map(async (k) => {
      try {
        const url = (await SOURCES[k]()).default;
        const tex = await loader.loadAsync(url);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        out[k] = pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
      } catch (e) {
        console.warn('[HDRI] failed to load', k, e);
      }
    }),
  );
  pmrem.dispose();
  return out;
}
