// Arcade-realistic vehicle dynamics (bicycle model with lateral slip). Pure logic, unit-tested.
// Heading convention: forward = (sin h, cos h) in the x/z plane; driver's right = (-cos h, sin h).
import { VehicleSpec } from '../config/vehicles';
import { clamp } from '../core/math';

export interface VehicleState {
  x: number; z: number; y: number;
  heading: number;
  vx: number; vz: number; // world velocity (m/s)
  yawRate: number;
  steer: number; // current front wheel angle (rad)
  rpm: number;
  gear: number; // 0 = reverse, 1.. = forward gears
  fuel: number; // litres
  damage: number; // 0..100
  wheelSpin: number; // accumulated wheel rotation (rad)
  lean: number; // two-wheeler visual lean (rad)
  engineOn: boolean;
  /** Time held at standstill on the brake (reverse engages after a short pause). */
  stopTimer?: number;
}

export interface VehicleControls { throttle: number; brake: number; steer: number; handbrake: boolean }

export interface DriveEnv { wetness: number; offroad?: boolean }

export const G = 9.81;

export function newVehicleState(spec: VehicleSpec, x = 0, z = 0, heading = 0): VehicleState {
  return { x, z, y: 0, heading, vx: 0, vz: 0, yawRate: 0, steer: 0, rpm: 0, gear: 1, fuel: spec.tankLitres * 0.6, damage: 0, wheelSpin: 0, lean: 0, engineOn: false };
}

export function forwardSpeed(s: VehicleState) {
  return s.vx * Math.sin(s.heading) + s.vz * Math.cos(s.heading);
}
export function lateralSpeed(s: VehicleState) {
  return s.vx * -Math.cos(s.heading) + s.vz * Math.sin(s.heading);
}

/** Performance multiplier from damage: heavy damage cuts power, wrecked engine stops. */
export function damagePower(d: number) {
  if (d >= 100) return 0;
  return d < 50 ? 1 : 1 - ((d - 50) / 50) * 0.6;
}

export function stepVehicle(spec: VehicleSpec, s: VehicleState, c: VehicleControls, dt: number, env: DriveEnv = { wetness: 0 }) {
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const rx = -Math.cos(s.heading), rz = Math.sin(s.heading);
  let vLong = s.vx * fx + s.vz * fz;
  let vLat = s.vx * rx + s.vz * rz;
  const vmax = spec.topSpeedKmh / 3.6;
  const twoWheeler = spec.category === 'two_wheeler';
  const gripMul = spec.grip * (1 - env.wetness * 0.3) * (env.offroad ? 0.75 : 1);
  const hasFuel = s.fuel > 0.0001;
  const power = s.engineOn && hasFuel ? damagePower(s.damage) : 0;

  // --- longitudinal
  let a = 0;
  const throttle = clamp(c.throttle, 0, 1), brake = clamp(c.brake, 0, 1);
  if (throttle > 0 && vLong > -0.5) {
    const ratio = clamp(vLong / vmax, 0, 1);
    a += spec.accel * throttle * power * (1 - ratio * ratio);
  }
  if (brake > 0) {
    if (Math.abs(vLong) < 0.4) s.stopTimer = (s.stopTimer ?? 0) + dt;
    if (vLong > 0.4) a -= spec.brake * brake * (1 - env.wetness * 0.25);
    else if ((s.stopTimer ?? 0) < 0.35) { a = 0; vLong *= 0.5; } // come to rest before engaging reverse
    else if (vLong > -15 / 3.6 && power > 0) a -= spec.accel * 0.55 * brake; // reverse
    else if (vLong <= -15 / 3.6) a += spec.brake * 0.3;
  } else s.stopTimer = 0;
  if (throttle > 0 && vLong < -0.5) a += spec.brake * throttle; // throttle while rolling back = brake
  if (c.handbrake) a -= Math.sign(vLong) * spec.brake * 0.55;
  // rolling resistance + aero drag (drag coefficient tuned so top speed is approached smoothly)
  const roll = 0.18 + (env.offroad ? 0.8 : 0);
  const aero = (spec.accel * 0.35) / (vmax * vmax);
  a -= Math.sign(vLong) * (roll + aero * vLong * vLong);
  const before = vLong;
  vLong += a * dt;
  // prevent drag/brake from reversing direction on their own
  if (throttle === 0 && !(brake > 0 && before <= 0.4) && Math.sign(before) !== Math.sign(vLong) && before !== 0) vLong = 0;
  if (Math.abs(vLong) < 0.02 && throttle === 0 && brake === 0) vLong = 0;

  // --- steering (speed-sensitive) & yaw
  const speedFactor = 1 / (1 + Math.abs(vLong) / (twoWheeler ? 14 : 18));
  const target = clamp(c.steer, -1, 1) * spec.steerMax * speedFactor;
  const steerRate = 2.8;
  s.steer += clamp(target - s.steer, -steerRate * dt, steerRate * dt);
  let yaw = (vLong * Math.tan(s.steer)) / spec.wheelbase;
  const maxLatAcc = gripMul * G * 0.95;
  const maxYaw = maxLatAcc / Math.max(1.5, Math.abs(vLong));
  yaw = clamp(yaw, -maxYaw, maxYaw); // understeer when exceeding grip
  // handbrake: rear grip loss lets the car rotate more freely
  if (c.handbrake && !twoWheeler && Math.abs(vLong) > 4) yaw *= 1.35;
  s.yawRate += (yaw - s.yawRate) * Math.min(1, dt * 8);
  s.heading += s.yawRate * dt;

  // --- lateral slip decay (grip)
  const latGrip = (c.handbrake && !twoWheeler ? 1.4 : 11) * gripMul;
  vLat *= Math.exp(-latGrip * dt);

  const nfx = Math.sin(s.heading), nfz = Math.cos(s.heading);
  const nrx = -Math.cos(s.heading), nrz = Math.sin(s.heading);
  s.vx = nfx * vLong + nrx * vLat;
  s.vz = nfz * vLong + nrz * vLat;
  s.x += s.vx * dt;
  s.z += s.vz * dt;

  // --- visuals/audio: wheel spin, lean, gears, rpm
  s.wheelSpin += (vLong / spec.wheelRadius) * dt;
  const targetLean = twoWheeler ? clamp(Math.atan((vLong * s.yawRate) / G), -0.75, 0.75) : 0;
  s.lean += (targetLean - s.lean) * Math.min(1, dt * 6);
  const speed = Math.abs(vLong);
  if (vLong < -0.3) s.gear = 0;
  else {
    const gearTop = vmax / spec.gears;
    s.gear = clamp(Math.floor(speed / (gearTop * 0.95)) + 1, 1, spec.gears);
  }
  const gearTop = vmax / spec.gears;
  const inGear = s.gear === 0 ? speed / (gearTop * 0.6) : (speed - (s.gear - 1) * gearTop * 0.95) / (gearTop * 0.95);
  const targetRpm = s.engineOn ? 900 + clamp(inGear, 0, 1.1) * 5200 + throttle * 600 * (speed < 1 ? 1 : 0.3) : 0;
  s.rpm += (targetRpm - s.rpm) * Math.min(1, dt * 6);

  // --- fuel
  if (s.engineOn) {
    const dist = speed * dt;
    const burn = (spec.litresPer100km / 100000) * dist * (0.45 + 0.75 * throttle) + 0.00025 * dt * (spec.category === 'bus' ? 4 : 1);
    s.fuel = Math.max(0, s.fuel - burn);
  }
  return s;
}

/**
 * Collision response against a static obstacle with contact normal (nx, nz).
 * Returns impact speed (m/s) along the normal, and applies damage.
 */
export function collideStatic(spec: VehicleSpec, s: VehicleState, nx: number, nz: number, restitution = 0.25) {
  const vn = s.vx * nx + s.vz * nz;
  if (vn >= 0) return 0;
  s.vx -= (1 + restitution) * vn * nx;
  s.vz -= (1 + restitution) * vn * nz;
  // scrub some tangential speed
  s.vx *= 0.85;
  s.vz *= 0.85;
  const impact = -vn;
  if (impact > 2.5) s.damage = Math.min(100, s.damage + (impact - 2.5) * (spec.category === 'two_wheeler' ? 5 : 3.2));
  s.yawRate *= 0.5;
  return impact;
}
