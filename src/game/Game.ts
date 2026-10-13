// Game orchestrator: owns the world, systems, UI and the main loop.
import * as THREE from 'three';
import { GameRenderer, Quality } from '../render/GameRenderer';
import { loadHdris } from '../render/hdri';
import { MaterialLib } from '../world/materials';
import { CollisionWorld } from '../world/Collision';
import { RoadGraph } from '../traffic/RoadGraph';
import { buildCity, CityBuildResult, updateSea } from '../world/CityBuilder';
import { Environment, WeatherKind } from '../world/Environment';
import { Interactable } from '../world/BuildContext';
import { VehicleInstancer } from '../vehicles/VehicleInstancer';
import { VehicleManager, DrivableVehicle } from '../vehicles/VehicleManager';
import { HumanRenderer, Pose, randomAppearance, Appearance, HumanHandle } from '../npc/HumanRenderer';
import { Input } from '../core/Input';
import { EventBus } from '../core/EventBus';
import { GameClock } from '../core/GameClock';
import { makeRng } from '../core/math';
import { Wallet } from '../economy/Wallet';
import { Inventory } from '../economy/Inventory';
import { ECONOMY } from '../config/economy';
import { PlayerController } from '../player/PlayerController';
import { CameraRig } from '../player/CameraRig';
import { HUD } from '../ui/HUD';
import { PLAYER_SPAWN, RAIL } from '../world/layout';
import { VEHICLES } from '../config/vehicles';

export interface GameSystem {
  update?(dt: number): void;
  fixed?(dt: number): void;
}

export class Game {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 9000);
  gr!: GameRenderer;
  mats!: MaterialLib;
  col = new CollisionWorld();
  graph = new RoadGraph();
  city!: CityBuildResult;
  instancer!: VehicleInstancer;
  env!: Environment;
  input!: Input;
  events = new EventBus();
  clock = new GameClock(1, 7 * 60 + 40, 1);
  wallet = new Wallet(ECONOMY.startingCash, ECONOMY.startingBank);
  inventory = new Inventory();
  player!: PlayerController;
  avatar!: HumanRenderer;
  avatarHandle!: HumanHandle;
  appearance: Appearance = randomAppearance(makeRng(11), false);
  cam!: CameraRig;
  vm!: VehicleManager;
  hud!: HUD;
  ui!: HTMLElement;
  systems: GameSystem[] = [];
  state: 'loading' | 'menu' | 'playing' | 'paused' = 'loading';
  /** When true, gameplay input is captured by a modal UI. */
  modalOpen = false;
  focusInteractable: Interactable | null = null;
  focusVehicle: DrivableVehicle | null = null;
  objective: { title: string; text: string; x?: number; z?: number } | null = null;
  /** Prompt supplied by a system (e.g. 'Get off at <station>') that overrides the default prompt. */
  extraPrompt: { key: string; text: string } | null = null;
  /** Shared clock for traffic signals (seconds of simulated traffic time). */
  signalTime = 0;
  private acc = 0;
  private last = performance.now();
  private needsAcc = 0;
  /** Extra interactables registered by systems at runtime. */
  dynamicInteractables: Interactable[] = [];
  /** Handlers per interactable kind (shops, doors, tickets...). */
  interactHandlers = new Map<string, (it: Interactable) => void>();
  /** Player riding as passenger (train/bus/taxi): position supplied each frame. */
  ridingProvider: (() => { x: number; y: number; z: number; heading: number; pose: number } | null) | null = null;

  async init(container: HTMLElement, quality: Quality, onProgress: (p: number, msg: string) => void) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    onProgress(0.05, 'Starting renderer');
    this.gr = new GameRenderer(container, this.scene, this.camera, quality);
    this.input = new Input(this.gr.renderer.domElement);
    await tick();
    onProgress(0.15, 'Generating materials');
    this.mats = new MaterialLib();
    await tick();
    onProgress(0.25, 'Building Sagar Nagar');
    this.city = buildCity(this.mats, this.col, this.graph);
    this.scene.add(this.city.group);
    await tick();
    onProgress(0.6, 'Parking two-wheelers');
    this.instancer = new VehicleInstancer(this.mats);
    for (const p of this.city.ctx.parkedVehicles) this.instancer.add(p.type, p.color, new THREE.Vector3(p.x, p.y, p.z), p.heading, p.lean);
    this.scene.add(this.instancer.group);
    await tick();
    onProgress(0.7, 'Lighting the sky');
    this.env = new Environment(this.scene, this.gr.renderer, this.mats);
    this.env.setLightSpots(this.city.ctx.lights, this.col);
    this.env.setShadowExtent(this.gr.settings.shadowExtent);
    this.env.setShadowQuality(this.gr.settings.shadowMap, this.gr.settings.shadows);
    this.env.setHdris(await loadHdris(this.gr.renderer));
    onProgress(0.85, 'Waking up the city');
    this.player = new PlayerController(this.col, PLAYER_SPAWN.x, RAIL.platformH, PLAYER_SPAWN.z, PLAYER_SPAWN.heading);
    this.avatar = new HumanRenderer(1, 'hero');
    this.avatarHandle = this.avatar.add(this.appearance);
    this.scene.add(this.avatar.mesh);
    this.cam = new CameraRig(this.camera, this.col);
    this.cam.snapBehind(PLAYER_SPAWN.heading);
    this.vm = new VehicleManager(this.instancer, this.col, this.scene);
    this.vm.onImpact = (v, sp) => { if (v === this.vm.current && sp > 4) this.hud.toast('Collision!', `Impact ${Math.round(sp * 3.6)} km/h — vehicle damaged`, 'warn', 2500); };
    this.wallet.clock = () => ({ day: this.clock.day, minute: this.clock.minuteOfDay });
    this.ui = document.getElementById('ui')!;
    this.hud = new HUD(this.ui);
    this.events.on('notify', (n) => this.hud.toast(n.title, n.body, n.kind));
    this.clock.newDay((d) => this.events.emit('time:newday', { day: d }));
    onProgress(1, 'Ready');
    this.gr.renderer.setAnimationLoop(() => this.frame());
  }

  addSystem(s: GameSystem) { this.systems.push(s); return s; }

  setAppearance(a: Appearance) {
    this.appearance = a;
    this.scene.remove(this.avatar.mesh);
    this.avatar = new HumanRenderer(1, 'hero');
    this.avatarHandle = this.avatar.add(a);
    this.scene.add(this.avatar.mesh);
  }

  setObjective(o: { title: string; text: string; x?: number; z?: number } | null) { this.objective = o; }

  /** Spawn a vehicle the player can drive. */
  spawnVehicle(type: string, color: string, x: number, z: number, heading: number, owned: boolean) {
    if (!VEHICLES[type]) throw new Error(type);
    return this.vm.spawn(type, color, x, z, heading, owned);
  }

  fade(fn: () => void) {
    let f = document.querySelector('.fade') as HTMLElement | null;
    if (!f) { f = document.createElement('div'); f.className = 'fade'; document.body.append(f); }
    f.style.opacity = '1';
    setTimeout(() => { fn(); setTimeout(() => (f!.style.opacity = '0'), 120); }, 620);
  }

  private frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.1);
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'menu') this.menuUpdate(dt);
    this.gr.setMood(this.env.nightFactor, this.env.rainAmount);
    this.gr.render();
    this.input.endFrame();
  }

  private menuUpdate(dt: number) {
    // slow cinematic dolly down Bazaar Gali at first-floor height
    const t = performance.now() / 1000;
    const x = -150 + ((t * 1.6) % 220);
    this.camera.position.set(x, 4.2, -99 + Math.sin(t * 0.1) * 1.5);
    const target = new THREE.Vector3(x + 30, 3.2, -100);
    this.camera.lookAt(target);
    this.env.update(dt, this.clock.hour, this.clock.totalMinutes, target, this.camera);
    for (const s of this.systems) s.update?.(dt);
  }

  private update(dt: number) {
    const input = this.input;
    input.uiCapture = this.modalOpen;
    // time & needs
    this.clock.advance(dt);
    this.needsAcc += dt * this.clock.timeScale;
    if (this.needsAcc > 1) { this.player.tickNeeds(this.needsAcc); this.needsAcc = 0; }

    const v = this.vm.current;
    if (v) this.vm.readControls(input);
    // fixed-step simulation
    this.acc += dt;
    const step = 1 / 60;
    let n = 0;
    while (this.acc >= step && n < 5) {
      this.vm.wetness = this.env.wetness;
      this.vm.step(step);
      for (const s of this.systems) s.fixed?.(step);
      this.acc -= step;
      n++;
    }
    if (n === 5) this.acc = 0;

    const riding = this.ridingProvider?.();
    if (riding) {
      this.player.teleport(riding.x, riding.y, riding.z, riding.heading);
      this.player.frozen = true;
    } else if (v) {
      const st = v.state;
      const seat = this.vm.seatWorld(v);
      this.player.teleport(seat.x, st.y, seat.z, st.heading);
    } else {
      this.player.frozen = this.modalOpen;
      this.player.update(dt, input, this.cam.yaw);
      this.pushOutOfVehicles();
    }
    this.vm.sync(this.env.nightFactor);

    // avatar
    const ps = this.player.s;
    if (riding) this.avatar.set(this.avatarHandle, ps.x, ps.y, ps.z, ps.heading, 0, dt, riding.pose);
    else if (v) {
      const seat = this.vm.seatWorld(v);
      const pose = v.twoWheeler || v.type === 'auto_rickshaw' ? Pose.Ride : Pose.Drive;
      this.avatar.set(this.avatarHandle, seat.x, seat.y - (pose === Pose.Ride ? 0.48 : 0.5), seat.z, v.state.heading, 0, dt, pose);
    } else this.avatar.set(this.avatarHandle, ps.x, ps.y, ps.z, ps.heading, ps.speed, dt, ps.crouch ? Pose.Squat : Pose.Stand);
    this.avatar.mesh.visible = !(v && this.cam.mode === 'firstperson');
    this.avatar.update(dt);

    // camera
    if (riding) {
      this.cam.setMode('train');
      this.cam.update(dt, input, new THREE.Vector3(ps.x, ps.y + 1.6, ps.z), ps.heading, 0, 1);
    } else if (v) {
      if (input.just('camera')) this.cam.setMode(this.cam.mode === 'firstperson' ? 'vehicle' : 'firstperson');
      if (this.cam.mode !== 'firstperson') this.cam.mode = 'vehicle';
      const st = v.state;
      if (this.cam.mode === 'firstperson') {
        const seat = this.vm.seatWorld(v);
        this.cam.update(dt, input, new THREE.Vector3(seat.x, seat.y + 0.68, seat.z), st.heading, v.speed, v.spec.length);
      } else {
        this.cam.update(dt, input, new THREE.Vector3(st.x, st.y + Math.max(1.3, v.spec.height * 0.85), st.z), st.heading, v.speed, v.spec.length);
      }
    } else {
      this.cam.setMode('onfoot');
      this.cam.update(dt, input, new THREE.Vector3(ps.x, ps.y + 1.55, ps.z), ps.heading, ps.speed);
    }

    this.handleInteraction();
    for (const s of this.systems) s.update?.(dt);
    this.env.update(dt, this.clock.hour, this.clock.totalMinutes, this.camera.position.clone().setY(0), this.camera);
    updateSea(this.city.sea, performance.now() / 1000);

    if (input.just('quicksave')) this.events.emit('notify', { title: 'Quick save', body: 'Use the pause menu to save', kind: 'info' });
    this.updateHud(dt);
  }

  private pushOutOfVehicles() {
    const ps = this.player.s;
    for (const v of this.vm.vehicles) {
      const st = v.state;
      const fx = Math.sin(st.heading), fz = Math.cos(st.heading);
      const dx = ps.x - st.x, dz = ps.z - st.z;
      const along = dx * fx + dz * fz, side = dx * -fz + dz * fx;
      const hl = v.spec.length / 2 + 0.3, hw = v.spec.width / 2 + 0.3;
      if (Math.abs(along) < hl && Math.abs(side) < hw) {
        const pa = hl - Math.abs(along), psd = hw - Math.abs(side);
        if (pa < psd) { ps.x += fx * Math.sign(along) * pa; ps.z += fz * Math.sign(along) * pa; }
        else { ps.x += -fz * Math.sign(side) * psd; ps.z += fx * Math.sign(side) * psd; }
      }
    }
  }

  private handleInteraction() {
    const ps = this.player.s;
    const input = this.input;
    this.focusInteractable = null;
    this.focusVehicle = null;
    if (this.modalOpen || this.ridingProvider?.()) return;
    if (this.vm.current) {
      if (input.just('vehicle') && Math.abs(this.vm.current.speed) < 3) {
        const v = this.vm.current;
        const spot = this.vm.exit();
        this.player.teleport(spot.x, this.col.groundHeight(spot.x, spot.z, v.state.y + 0.3), spot.z, spot.heading);
        this.cam.setMode('onfoot');
        this.events.emit('vehicle:exit', { vehicleId: v.id });
      }
      return;
    }
    // nearest interactable in front of the player
    let best: Interactable | null = null, bd = Infinity;
    for (const it of [...this.city.ctx.interactables, ...this.dynamicInteractables]) {
      const d = Math.hypot(it.x - ps.x, it.z - ps.z);
      if (d > it.radius || Math.abs(it.y - ps.y) > 2.2) continue;
      if (d < bd) { bd = d; best = it; }
    }
    this.focusInteractable = best;
    const veh = this.vm.nearestEnterable(ps.x, ps.z, 2.6);
    this.focusVehicle = veh;
    if (veh && input.just('vehicle')) {
      if (!veh.owned && !(veh as any).rentedBy) {
        this.events.emit('notify', { title: 'Not your vehicle', body: 'You can only drive vehicles you own or rent.', kind: 'warn' });
      } else {
        this.vm.enter(veh);
        this.cam.setMode('vehicle');
        this.cam.snapBehind(veh.state.heading);
        this.events.emit('vehicle:enter', { vehicleId: veh.id, type: veh.type, owned: veh.owned });
        if (veh.state.fuel <= 0) this.events.emit('notify', { title: 'Out of fuel', body: 'Push it to Sagar Fuels or call Sharma Mama.', kind: 'warn' });
      }
      return;
    }
    if (best && input.just('interact')) {
      const h = this.interactHandlers.get(best.kind);
      if (h) h(best);
      else this.events.emit('notify', { title: best.label, body: 'Nothing to do here yet.', kind: 'info' });
    }
  }

  private updateHud(dt: number) {
    const ps = this.player.s;
    const v = this.vm.current;
    let prompt: { key: string; text: string } | null = null;
    if (!this.modalOpen && this.extraPrompt) prompt = this.extraPrompt;
    else if (!this.modalOpen) {
      if (v) prompt = Math.abs(v.speed) < 3 ? { key: 'F', text: `Exit ${v.spec.name}` } : null;
      else if (this.focusVehicle) prompt = { key: 'F', text: this.focusVehicle.owned || (this.focusVehicle as any).rentedBy ? `${this.focusVehicle.twoWheeler ? 'Ride' : 'Drive'} ${this.focusVehicle.spec.brand} ${this.focusVehicle.spec.name}` : `${this.focusVehicle.spec.brand} ${this.focusVehicle.spec.name} (not yours)` };
      else if (this.focusInteractable) prompt = { key: 'E', text: this.focusInteractable.label };
    }
    const o = this.objective;
    this.hud.update({
      clock: this.clock.format(),
      day: `Day ${this.clock.day}, ${this.clock.weekday}`,
      weather: this.env.label,
      cash: this.wallet.cash, bank: this.wallet.bank,
      health: ps.health, stamina: ps.stamina, hunger: ps.hunger, energy: ps.energy,
      objective: o ? { title: o.title, text: o.text, dist: o.x !== undefined ? Math.hypot(o.x - ps.x, o.z! - ps.z) : undefined } : null,
      prompt,
      vehicle: v ? { kmh: v.kmh, gear: v.state.gear, rpm: v.state.rpm, fuel: v.state.fuel, fuelMax: v.spec.tankLitres, damage: v.state.damage, lights: v.lightsOn, name: `${v.spec.brand} ${v.spec.name}` } : null,
      px: ps.x, pz: ps.z, heading: v ? v.state.heading : ps.heading, camYaw: this.cam.yaw,
      target: o && o.x !== undefined ? { x: o.x, z: o.z! } : null,
    }, dt);
  }

  setWeather(k: WeatherKind) { this.env.setWeather(k, true); }

  /** Step the simulation without rendering (automated tests / debugging). */
  simulate(seconds: number, dt = 1 / 30) {
    const n = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < n; i++) {
      if (this.state === 'playing') this.update(dt);
      this.input.endFrame();
    }
  }

  /** Press a key for one simulated frame (automated tests). */
  tap(code: string) {
    this.input.simulate(code, true);
    this.simulate(1 / 30);
    this.input.simulate(code, false);
  }
}
