import { describe, it, expect } from 'vitest';
import { VEHICLES } from '../src/config/vehicles';
import { newVehicleState, stepVehicle, forwardSpeed, collideStatic } from '../src/vehicles/VehiclePhysics';

const drive = (id: string, throttle: number, secs: number, extra: Partial<{ steer: number; brake: number; wet: number }> = {}) => {
  const spec = VEHICLES[id];
  const s = newVehicleState(spec);
  s.engineOn = true;
  s.fuel = spec.tankLitres;
  for (let t = 0; t < secs; t += 1 / 60) stepVehicle(spec, s, { throttle, brake: extra.brake ?? 0, steer: extra.steer ?? 0, handbrake: false }, 1 / 60, { wetness: extra.wet ?? 0 });
  return { spec, s };
};

describe('Vehicle physics', () => {
  it('accelerates towards but never beyond top speed', () => {
    for (const id of ['kesari_raftaar', 'auto_rickshaw', 'rajhans_pixie', 'vega_gt']) {
      const { spec, s } = drive(id, 1, 90);
      const kmh = forwardSpeed(s) * 3.6;
      expect(kmh).toBeGreaterThan(spec.topSpeedKmh * 0.7);
      expect(kmh).toBeLessThanOrEqual(spec.topSpeedKmh + 1);
    }
  });
  it('vehicles feel different: sports car out-accelerates the auto-rickshaw', () => {
    expect(forwardSpeed(drive('vega_gt', 1, 5).s)).toBeGreaterThan(forwardSpeed(drive('auto_rickshaw', 1, 5).s) * 2);
  });
  it('brakes to a stop and does not roll backwards on its own', () => {
    const spec = VEHICLES.rajhans_pixie;
    const { s } = drive('rajhans_pixie', 1, 8);
    for (let t = 0; t < 10; t += 1 / 60) stepVehicle(spec, s, { throttle: 0, brake: 0, steer: 0, handbrake: true }, 1 / 60);
    expect(Math.abs(forwardSpeed(s))).toBeLessThan(0.05);
  });
  it('steers left with positive steer input', () => {
    const { s } = drive('rajhans_pixie', 0.5, 4, { steer: 1 });
    expect(s.heading).toBeGreaterThan(0.3);
  });
  it('burns fuel and stops without it', () => {
    const { spec, s } = drive('kesari_raftaar', 1, 30);
    expect(s.fuel).toBeLessThan(spec.tankLitres);
    s.fuel = 0;
    const v0 = forwardSpeed(s);
    for (let t = 0; t < 5; t += 1 / 60) stepVehicle(spec, s, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60);
    expect(forwardSpeed(s)).toBeLessThan(v0);
  });
  it('wet roads reduce cornering grip', () => {
    const dry = drive('rajhans_avanti', 1, 6, { steer: 1 }).s;
    const wet = drive('rajhans_avanti', 1, 6, { steer: 1, wet: 1 }).s;
    expect(Math.abs(wet.heading)).toBeLessThan(Math.abs(dry.heading) + 1e-6);
  });
  it('collisions bounce and damage', () => {
    const spec = VEHICLES.rajhans_pixie;
    const s = newVehicleState(spec);
    s.vz = 15;
    const impact = collideStatic(spec, s, 0, -1);
    expect(impact).toBeCloseTo(15);
    expect(s.vz).toBeLessThan(0);
    expect(s.damage).toBeGreaterThan(0);
  });
});
