import { describe, it, expect } from 'vitest';
import { defaultSave, encodeSave, decodeSave, validateSave, SaveStore } from '../src/save/SaveSystem';

class MemStore { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }

describe('Save system', () => {
  it('round-trips a save', () => {
    const d = defaultSave();
    d.wallet.cash = 123456;
    d.player.x = -100;
    d.missions.completed = ['m_arrival'];
    const r = decodeSave(encodeSave(d));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.wallet.cash).toBe(123456);
      expect(r.data.player.x).toBe(-100);
      expect(r.data.missions.completed).toEqual(['m_arrival']);
      expect(r.repaired).toEqual([]);
    }
  });
  it('detects corruption via checksum', () => {
    const enc = encodeSave(defaultSave());
    const tampered = enc.replace('150000', '999999999');
    const r = decodeSave(tampered);
    expect(r.ok).toBe(false);
  });
  it('rejects garbage', () => {
    expect(decodeSave('not json').ok).toBe(false);
    expect(decodeSave(null).ok).toBe(false);
    expect(decodeSave('{"x":1}').ok).toBe(false);
  });
  it('repairs invalid fields with defaults', () => {
    const bad: any = defaultSave();
    bad.wallet.cash = -50;
    bad.wallet.bank = 'lots';
    bad.player.health = 9999;
    bad.player.x = NaN;
    bad.appearance.skin = 'red';
    bad.vehicles = [{ id: 'a', type: 'kesari_raftaar', color: '#ff0000', fuel: 1e9 }, { nope: true }];
    const { data, repaired } = validateSave(bad);
    expect(data.wallet.cash).toBe(0);
    expect(data.wallet.bank).toBe(defaultSave().wallet.bank);
    expect(data.player.health).toBe(100);
    expect(Number.isFinite(data.player.x)).toBe(true);
    expect(data.appearance.skin).toMatch(/^#/);
    expect(data.vehicles.length).toBe(1);
    expect(data.vehicles[0].fuel).toBeLessThanOrEqual(500);
    expect(repaired.length).toBeGreaterThan(0);
  });
  it('falls back to the backup when the main slot is corrupted', () => {
    const mem = new MemStore();
    const store = new SaveStore(mem);
    const a = defaultSave(); a.wallet.cash = 111;
    store.write('slot1', a);
    const b = defaultSave(); b.wallet.cash = 222;
    store.write('slot1', b);
    mem.setItem('bharatlife.save.slot1', '{broken');
    const r = store.read('slot1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.wallet.cash).toBe(111);
  });
});
