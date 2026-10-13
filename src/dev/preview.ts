// Dev preview: renders the world from a fixed camera (URL params) for visual comparison screenshots.
import * as THREE from 'three';
import { MaterialLib } from '../world/materials';
import { CollisionWorld } from '../world/Collision';
import { RoadGraph } from '../traffic/RoadGraph';
import { buildCity } from '../world/CityBuilder';
import { Environment } from '../world/Environment';
import { GameRenderer, Quality } from '../render/GameRenderer';
import { loadHdris } from '../render/hdri';
import { VehicleInstancer } from '../vehicles/VehicleInstancer';
import { HumanRenderer, randomAppearance, Pose } from '../npc/HumanRenderer';
import { makeRng } from '../core/math';
import { ROADS, roadHalfWidth } from '../world/layout';

export async function boot() {
  const q = new URLSearchParams(location.search);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 55), innerWidth / innerHeight, 0.2, 9000);
  const gr = new GameRenderer(document.body, scene, camera, (q.get('q') as Quality) ?? 'high');
  const mats = new MaterialLib();
  const col = new CollisionWorld();
  const graph = new RoadGraph();
  const city = buildCity(mats, col, graph);
  scene.add(city.group);
  const vi = new VehicleInstancer(mats);
  for (const p of city.ctx.parkedVehicles) vi.add(p.type, p.color, new THREE.Vector3(p.x, p.y, p.z), p.heading, p.lean);
  scene.add(vi.group);
  if (q.get('showcase') === 'vehicles') {
    // close-up inspection row on Tilak Marg
    const types = ['kesari_raftaar', 'chetak_scooter', 'tejas_r200', 'auto_rickshaw', 'padma_taxi', 'rajhans_pixie', 'rajhans_avanti', 'gajraj_x7', 'mbt_bus', 'dhruv_truck'];
    let x = -128;
    const cols: Record<string, string> = { kesari_raftaar: '#7a1414', chetak_scooter: '#2f5d8a', tejas_r200: '#e05a12', auto_rickshaw: '#151515', padma_taxi: '#111111', rajhans_pixie: '#b51e1e', rajhans_avanti: '#d8d8d4', gajraj_x7: '#20406e', mbt_bus: '#b3201b', dhruv_truck: '#f2b51b' };
    for (const t of types) {
      const L = (await import('../config/vehicles')).VEHICLES[t].length;
      x += L / 2 + 1.2;
      vi.add(t, cols[t], new THREE.Vector3(x, 0, -3.2), Math.PI / 2 + 0.35, 0);
      x += L / 2 + 1.2;
    }
  }
  // Preview crowd: people at NPC spots + pedestrians on the market street footpaths
  const crowd = new HumanRenderer(700);
  scene.add(crowd.mesh);
  const rng = makeRng(5);
  const walkers: { h: ReturnType<HumanRenderer['add']>; x: number; y: number; z: number; hd: number; sp: number; pose: number }[] = [];
  for (const s of city.ctx.npcSpots) {
    const h = crowd.add(randomAppearance(rng));
    const pose = s.role === 'vendor' && rng.chance(0.35) ? Pose.Squat : s.role === 'commuter' && rng.chance(0.2) ? Pose.Phone : Pose.Stand;
    walkers.push({ h, x: s.x, y: s.y, z: s.z, hd: s.heading, sp: 0, pose });
  }
  const bz = ROADS.find((r) => r.id === 'bazaar')!;
  const bh = roadHalfWidth(bz);
  for (let i = 0; i < 160; i++) {
    const side = rng.chance(0.5) ? -1 : 1;
    const x = rng.range(-225, 140), z = bz.c + side * (bh + rng.range(0.5, 2.6));
    const dir = rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
    const h = crowd.add(randomAppearance(rng));
    const walking = rng.chance(0.75);
    walkers.push({ h, x, y: 0.15, z, hd: dir + rng.range(-0.25, 0.25), sp: walking ? rng.range(1.0, 1.5) : 0, pose: !walking && rng.chance(0.3) ? Pose.Phone : Pose.Stand });
  }
  for (let i = 0; i < 25; i++) {
    // some people walking on the road edge (very common in Indian markets)
    const side = rng.chance(0.5) ? -1 : 1;
    const h = crowd.add(randomAppearance(rng));
    walkers.push({ h, x: rng.range(-225, 140), y: 0, z: bz.c + side * rng.range(1.0, 2.5), hd: rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2, sp: rng.range(1.0, 1.4), pose: Pose.Stand });
  }
  for (const w of walkers) crowd.set(w.h, w.x, w.y, w.z, w.hd, w.sp, rng.range(0, 2), w.pose);
  if (q.get('rain')) for (const w of walkers) if (rng.chance(0.6)) crowd.setUmbrella(w.h, true);
  const env = new Environment(scene, gr.renderer, mats);
  env.setLightSpots(city.ctx.lights, col);
  env.setShadowExtent(gr.settings.shadowExtent);
  env.setHdris(await loadHdris(gr.renderer));
  const hour = Number(q.get('hour') ?? 10);
  if (q.get('weather')) env.setWeather(q.get('weather') as any, true);
  const cx = Number(q.get('x') ?? 40), cz = Number(q.get('z') ?? 30), cy = Number(q.get('y') ?? 25);
  const tx = Number(q.get('tx') ?? 0), tz = Number(q.get('tz') ?? -40);
  camera.position.set(cx, cy, cz);
  camera.lookAt(tx, Number(q.get('ty') ?? 2), tz);
  const focus = new THREE.Vector3(cx, 0, cz).lerp(new THREE.Vector3(tx, 0, tz), 0.3);
  for (let i = 0; i < 3; i++) env.update(1, hour, 600, focus, camera);
  gr.setMood(env.nightFactor, env.rainAmount);
  console.info('[Boot] parked vehicles', city.ctx.parkedVehicles.length);
  (window as any).__info = { gpu: gr.gpuInfo(), calls: () => gr.renderer.info.render };
  if (q.get('still')) {
    // headless capture: render a few frames, then stop so the screenshot can grab the canvas
    for (const w of walkers) crowd.set(w.h, w.x, w.y, w.z, w.hd, w.sp, 0.016, w.pose);
    crowd.update(0.016);
    for (let i = 0; i < 2; i++) { env.update(0.016, hour, 600, focus, camera); gr.setMood(env.nightFactor, env.rainAmount); gr.render(); }
    console.info('[Boot] draw calls', gr.renderer.info.render.calls, 'triangles', gr.renderer.info.render.triangles);
    (window as any).__ready = true;
    return;
  }
  (window as any).__ready = true;
  gr.renderer.setAnimationLoop(() => {
    for (const w of walkers) {
      if (q.get('anim')) { w.x += Math.sin(w.hd) * w.sp * 0.016; w.z += Math.cos(w.hd) * w.sp * 0.016; }
      crowd.set(w.h, w.x, w.y, w.z, w.hd, w.sp, 0.016, w.pose);
    }
    crowd.update(0.016);
    env.update(0.016, hour, 600, focus, camera);
    gr.setMood(env.nightFactor, env.rainAmount);
    gr.render();
  });
}

