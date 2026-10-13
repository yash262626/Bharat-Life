// On-foot third-person movement over the layered collision world (kerbs, platforms, stairs, bridges).
import { CollisionWorld } from '../world/Collision';
import { Input } from '../core/Input';
import { clamp, dampAngle, wrapAngle } from '../core/math';

export interface PlayerState {
  x: number; y: number; z: number;
  heading: number;
  speed: number; // horizontal speed (m/s)
  vy: number;
  grounded: boolean;
  stamina: number; // 0..100
  health: number; // 0..100
  hunger: number; // 0..100 (100 = full)
  energy: number; // 0..100
  crouch: boolean;
}

export const WALK = 1.45, RUN = 4.2, SPRINT = 6.3, CROUCH = 0.9;
const RADIUS = 0.32, HEIGHT = 1.75, GRAVITY = 18, JUMP_V = 5.2;

export class PlayerController {
  s: PlayerState;
  /** Set by the game when the player cannot move (riding a train, in menus, cutscenes). */
  frozen = false;
  private vx = 0;
  private vz = 0;
  surfaceTag: string | undefined;
  onLand: (fallSpeed: number) => void = () => {};

  constructor(private col: CollisionWorld, x: number, y: number, z: number, heading = 0) {
    this.s = { x, y, z, heading, speed: 0, vy: 0, grounded: true, stamina: 100, health: 100, hunger: 80, energy: 85, crouch: false };
  }

  teleport(x: number, y: number, z: number, heading?: number) {
    Object.assign(this.s, { x, y, z, vy: 0, speed: 0 });
    if (heading !== undefined) this.s.heading = heading;
    this.vx = this.vz = 0;
  }

  /** camYaw: camera yaw (radians, 0 = looking towards +z). */
  update(dt: number, input: Input, camYaw: number) {
    const s = this.s;
    if (this.frozen) { s.speed = 0; this.vx = this.vz = 0; return; }
    const fwd = input.axis('back', 'forward');
    const side = input.axis('right', 'left');
    if (input.just('crouch')) s.crouch = !s.crouch;
    const moving = fwd !== 0 || side !== 0;
    let target = 0;
    if (moving) {
      const sprinting = input.held('sprint') && s.stamina > 5 && !s.crouch;
      target = s.crouch ? CROUCH : sprinting ? SPRINT : RUN;
      if (input.held('sprint') === false && !s.crouch) target = RUN;
      // walking slowly when exhausted or hungry
      if (s.energy < 10 || s.hunger < 5) target = Math.min(target, WALK * 1.4);
      if (sprinting) s.stamina = Math.max(0, s.stamina - dt * 14);
      // desired direction relative to the camera
      const ang = camYaw + Math.atan2(side, fwd);
      s.heading = dampAngle(s.heading, ang, 12, dt);
      const dirX = Math.sin(ang), dirZ = Math.cos(ang);
      const accel = s.grounded ? 14 : 3;
      this.vx += (dirX * target - this.vx) * Math.min(1, accel * dt);
      this.vz += (dirZ * target - this.vz) * Math.min(1, accel * dt);
    } else {
      const decel = s.grounded ? 12 : 1.5;
      this.vx += -this.vx * Math.min(1, decel * dt);
      this.vz += -this.vz * Math.min(1, decel * dt);
    }
    if (!input.held('sprint') || !moving) s.stamina = Math.min(100, s.stamina + dt * 9);

    // jump & gravity
    if (s.grounded && input.just('jump') && !s.crouch) { s.vy = JUMP_V; s.grounded = false; }
    s.vy -= GRAVITY * dt;

    // horizontal move + collision (sub-stepped for fast motion)
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.25));
    for (let i = 0; i < steps; i++) {
      const nx = s.x + (this.vx * dt) / steps, nz = s.z + (this.vz * dt) / steps;
      // step-up: probe the ground at the new location first so kerbs/stairs don't block
      const gy = this.col.groundHeight(nx, nz, s.y);
      const footY = Math.max(s.y, gy) + 0.05;
      const r = this.col.resolveCircle(nx, nz, RADIUS, footY, HEIGHT - 0.1, undefined, 'median');
      s.x = r.x;
      s.z = r.z;
      if (r.hit) {
        // remove velocity into the wall so we slide along it
        const vn = this.vx * r.nx + this.vz * r.nz;
        if (vn < 0) { this.vx -= vn * r.nx; this.vz -= vn * r.nz; }
      }
    }
    // vertical
    const ground = this.col.groundHeight(s.x, s.z, s.y);
    s.y += s.vy * dt;
    if (s.y <= ground) {
      if (!s.grounded && s.vy < -9) this.onLand(-s.vy);
      s.y = ground;
      s.vy = 0;
      s.grounded = true;
    } else if (s.y - ground > 0.08) {
      s.grounded = false;
    } else if (s.vy <= 0) {
      // snap down small steps when walking off kerbs
      s.y = ground; s.vy = 0; s.grounded = true;
    }
    s.speed = Math.hypot(this.vx, this.vz);
    this.surfaceTag = this.col.surfaceTag(s.x, s.z, s.y);
  }

  /** Needs drain over in-game time (minutes). */
  tickNeeds(gameMinutes: number) {
    const s = this.s;
    s.hunger = clamp(s.hunger - gameMinutes * 0.045, 0, 100);
    s.energy = clamp(s.energy - gameMinutes * 0.03 * (s.speed > RUN ? 2 : 1), 0, 100);
    if (s.hunger < 3) s.health = clamp(s.health - gameMinutes * 0.05, 0, 100);
    else if (s.hunger > 40 && s.energy > 30) s.health = clamp(s.health + gameMinutes * 0.03, 0, 100);
  }

  /** Knock the player back (vehicle hit, train) and apply damage. */
  knock(dirX: number, dirZ: number, power: number) {
    this.vx += dirX * power;
    this.vz += dirZ * power;
    this.s.vy = Math.min(4, power * 0.3);
    this.s.grounded = false;
    this.s.health = clamp(this.s.health - power * 4, 0, 100);
  }

  faceTowards(x: number, z: number) { this.s.heading = wrapAngle(Math.atan2(x - this.s.x, z - this.s.z)); }
}
