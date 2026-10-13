import { describe, it, expect } from 'vitest';
import { MissionManager } from '../src/missions/MissionManager';
import { EventBus } from '../src/core/EventBus';
import { Wallet } from '../src/economy/Wallet';
import { MissionDef } from '../src/config/missions';
import { MISSIONS } from '../src/config/missions';

function host() {
  const events = new EventBus();
  const wallet = new Wallet(0, 0);
  const pos = { x: 0, z: 0, inVehicle: false };
  const said: string[] = [];
  let objective: any = null;
  return { events, wallet, pos, said, get objective() { return objective; }, h: { events, wallet, playerPos: () => pos, setObjective: (o: any) => (objective = o), say: (_w: string, t: string) => said.push(t) } };
}

const TEST: MissionDef[] = [
  { id: 'a', title: 'A', titleHi: 'ए', type: 'story', auto: true, requires: [], description: '', steps: [
    { kind: 'goto', x: 10, z: 0, r: 2, text: 'go' },
    { kind: 'event', event: 'shop:purchase', match: { shopId: 'raju_chai' }, text: 'buy chai' },
    { kind: 'action', action: 'gift' },
  ], reward: { cash: 5000 } },
  { id: 'b', title: 'B', titleHi: 'बी', type: 'side', requires: ['a'], description: '', steps: [{ kind: 'goto', x: 0, z: 50, r: 2, text: 'run' }], reward: { bank: 100 }, timeLimitSec: 5 },
];

describe('MissionManager', () => {
  it('auto-starts, follows steps, matches events, runs actions and pays rewards', () => {
    const t = host();
    const mm = new MissionManager(t.h, TEST);
    let gifted = false;
    mm.actions.set('gift', () => (gifted = true));
    mm.update(0.1);
    expect(mm.active?.def.id).toBe('a');
    expect(t.objective.text).toBe('go');
    t.pos.x = 10; mm.update(0.1);
    expect(t.objective.text).toBe('buy chai');
    t.events.emit('shop:purchase', { shopId: 'other', itemId: 'x', price: 1 });
    mm.update(0.1);
    expect(t.objective.text).toBe('buy chai');
    t.events.emit('shop:purchase', { shopId: 'raju_chai', itemId: 'cutting_chai', price: 1200 });
    mm.update(0.1);
    expect(gifted).toBe(true);
    expect(mm.completed.has('a')).toBe(true);
    expect(t.wallet.cash).toBe(5000);
  });
  it('fails timed missions and allows retry', () => {
    const t = host();
    const mm = new MissionManager(t.h, TEST);
    mm.completed.add('a');
    expect(mm.start('b')).toBe(true);
    for (let i = 0; i < 60; i++) mm.update(0.1);
    expect(mm.active).toBeNull();
    expect(mm.completed.has('b')).toBe(false);
    expect(mm.start('b')).toBe(true);
  });
  it('persists and resumes mid-mission', () => {
    const t = host();
    const mm = new MissionManager(t.h, TEST);
    mm.update(0.1);
    t.pos.x = 10; mm.update(0.1);
    const saved = mm.serialize();
    const t2 = host();
    const mm2 = new MissionManager(t2.h, TEST);
    mm2.load(saved);
    expect(mm2.active?.def.id).toBe('a');
    expect(t2.objective.text).toBe('buy chai');
  });
  it('dialogue steps finish after the last line has been shown', () => {
    const t = host();
    const defs: MissionDef[] = [{ id: 's', title: 'S', titleHi: 'एस', type: 'story', auto: true, requires: [], description: '', steps: [
      { kind: 'say', lines: [['A', 'Hello'], ['B', 'Namaste']] }, { kind: 'goto', x: 0, z: 0, r: 1, text: 'here' },
    ], reward: {} }];
    const mm = new MissionManager(t.h, defs);
    for (let i = 0; i < 200; i++) mm.update(0.1);
    expect(t.said).toEqual(['Hello', 'Namaste']);
    expect(mm.completed.has('s')).toBe(true);
  });
  it('story missions form a valid chain', () => {
    const ids = new Set(MISSIONS.map((m) => m.id));
    for (const m of MISSIONS) for (const r of m.requires) expect(ids.has(r)).toBe(true);
  });
});
